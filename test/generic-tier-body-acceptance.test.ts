// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  GENERIC_EQUIPMENT_TIERS, resolveGenericEquipmentTierCatalog,
  resolveGenericEquipmentExposureCapabilities, resolveReleaseSequence,
  createFocusControlState, resolveFocusTargetObservation, assessFocusReleaseGate,
  meterRelativeExposure, resolveCaptureGeometry, estimateAutoWhiteBalance,
  createLockedWhiteBalanceState, calculateSensorReadoutTiming,
  type GenericEquipmentTier, type ReleaseBaseCaptureState,
  type ExposureMeteringSampleSet, type PreWhiteBalanceRgbSampleSet
} from "../src/index.js";
import { loadBasicReferenceFixture } from "./helpers/basic-reference-fixture.js";

const base = loadBasicReferenceFixture();
const catalog = resolveGenericEquipmentTierCatalog({ presetVersion: "1.0.0" });
function preset(tier: GenericEquipmentTier): (typeof catalog)[number] {
  return catalog.find((p) => p.tier === tier)!;
}
const baseState = (): ReleaseBaseCaptureState => ({
  exposure: { aperture: base.lens.aperture, shutterSeconds: base.exposure.shutterSeconds, iso: base.exposure.iso },
  focus: { kind: "finite", distanceM: base.focus.distanceM }, whiteBalanceStateId: "tier-wb",
  automation: { ae: "locked", af: "locked", awb: "locked" }
});
describe("exact-version tier body execution acceptance", () => {
  it.each(GENERIC_EQUIPMENT_TIERS)("%s executes deterministic cadence, slow-shutter and self-timer boundaries", (tier) => {
    const p = preset(tier), exposureCapabilities = resolveGenericEquipmentExposureCapabilities({
      bodyProfile: p.body.exposure, lensProfile: p.lens.exposure, selectedFocalLengthMm: base.lens.focalLengthMm
    });
    const input = { sequenceId: "tier-burst", releaseRequestTimeSeconds: 1, sequenceSeedUint32: base.stochasticSeedUint32,
      drive: { kind: "burst" as const, frameCount: 3 }, bracket: { kind: "none" as const },
      requestedCadenceFps: 100, baseState: baseState(), releaseCapabilities: p.body.release, exposureCapabilities };
    const fast = resolveReleaseSequence(input);
    const interval = 1 / p.body.release.maximumCadenceFps.value;
    fast.frames.forEach((frame, i) => {
      expect(frame.exposureStartTimeSeconds).toBeCloseTo(1 + i * interval, 12);
      expect(frame.exposureEndTimeSeconds).toBeCloseTo(1 + i * interval + base.exposure.shutterSeconds, 12);
      expect(frame.exposure).toEqual(input.baseState.exposure);
      expect(frame.focus).toEqual(input.baseState.focus);
      expect(frame.whiteBalanceStateId).toBe("tier-wb");
    });
    expect(new Set(fast.frames.map((frame) => frame.stochasticSeedUint32)).size).toBe(3);
    expect(resolveReleaseSequence(input)).toEqual(fast);
    const slow = resolveReleaseSequence({ ...input,
      baseState: { ...baseState(), exposure: { ...baseState().exposure, shutterSeconds: .5 } } });
    slow.frames.forEach((frame, i) => expect(frame.exposureStartTimeSeconds).toBeCloseTo(1 + i * .5, 12));
    const timer = resolveReleaseSequence({ ...input, drive: { kind: "self-timer", delaySeconds: 2, frameCount: 3 } });
    timer.frames.forEach((frame, i) => expect(frame.exposureStartTimeSeconds).toBeCloseTo(3 + i * interval, 12));
    expect(() => resolveReleaseSequence({ ...input, drive: { kind: "burst", frameCount: p.body.release.maximumLogicalFramesPerSequence.value + 1 } })).toThrow();
    expect(() => resolveReleaseSequence({ ...input, bracket: { kind: "focus", focusStates: [{ kind: "finite", distanceM: 3 }] } })).toThrow();
    expect(fast.bufferMediaThermalSlowdownModeled).toBe(false);
  });
  it.each(GENERIC_EQUIPMENT_TIERS)("%s respects AF mode availability, held single focus and release policy", (tier) => {
    const profile = preset(tier).body.focus;
    const initial = createFocusControlState({ stateId: "tier-af", profile, mode: "single-af",
      initialFocus: { kind: "finite", distanceM: base.focus.distanceM } });
    expect(assessFocusReleaseGate({ state: initial, profile, priority: "focus-priority" }).releaseAuthorized).toBe(false);
    expect(assessFocusReleaseGate({ state: initial, profile, priority: "release-priority" }).releaseAuthorized).toBe(true);
    const acquired = resolveFocusTargetObservation({ state: initial, stateId: "tier-acquired", event: "acquire",
      observation: { kind: "finite-surface", targetId: "tier-target", observedAtSeconds: 1, longitudinalDistanceM: 3 } }).state;
    const held = resolveFocusTargetObservation({ state: acquired, stateId: "tier-held", event: "update",
      observation: { kind: "finite-surface", targetId: "tier-target", observedAtSeconds: 2, longitudinalDistanceM: 4 } }).state;
    expect(held.focus).toEqual({ kind: "finite", distanceM: 3 });
    expect(held).toBe(acquired);
    expect(assessFocusReleaseGate({ state: acquired, profile, priority: "focus-priority" }).releaseAuthorized).toBe(true);
    const continuous = (): ReturnType<typeof createFocusControlState> => createFocusControlState({
      stateId: "tier-continuous", profile, mode: "continuous-af", initialFocus: initial.focus });
    if (tier === "consumer") { expect(continuous).toThrow(); return; }
    const tracked = resolveFocusTargetObservation({ state: continuous(), stateId: "tier-tracked", event: "acquire",
      observation: { kind: "finite-surface", targetId: "tier-target", observedAtSeconds: 1, longitudinalDistanceM: 3 } }).state;
    const moved = resolveFocusTargetObservation({ state: tracked, stateId: "tier-moved", event: "update",
      observation: { kind: "finite-surface", targetId: "tier-target", observedAtSeconds: 2, longitudinalDistanceM: 4 } }).state;
    expect(moved.focus).toEqual({ kind: "finite", distanceM: 4 });
    const lost = resolveFocusTargetObservation({ state: moved, stateId: "tier-lost", event: "update",
      observation: { kind: "unavailable", targetId: "tier-target", observedAtSeconds: 3, reason: "out-of-frame" } }).state;
    expect(lost.focus).toEqual(moved.focus);
    expect(lost.acquisitionState).toBe("target-lost");
    expect(() => resolveFocusTargetObservation({ state: lost, stateId: "tier-silent", event: "update",
      observation: { kind: "finite-surface", targetId: "tier-target", observedAtSeconds: 4, longitudinalDistanceM: 2 } })).toThrow();
    expect(moved.actuatorModel).toBe("ideal-instantaneous");
    expect(moved.exposureModified).toBe(false);
  });
  it.each(GENERIC_EQUIPMENT_TIERS)("%s meters explicit policies independently of output crop and post-processing", (tier) => {
    const p = preset(tier), geometry = resolveCaptureGeometry(base.sensor).value;
    const sampleSet: ExposureMeteringSampleSet = { measurementId: "tier-meter", sceneStateId: base.fixtureId,
      inputDomain: "relative-pre-exposure-linear-signal", captureRegion: "oriented-active-capture", captureGeometry: geometry,
      processingState: { exposureSettingsApplied: false, whiteBalanceApplied: false, toneMappingApplied: false,
        displayGammaApplied: false, sharpeningApplied: false },
      samples: [.1, .3, 1].map((signal, i) => ({ sampleId: "zone-" + i,
        positionOrientedCaptureUv: { u: i / 2, v: .5 }, relativeLinearSignal: signal, areaWeight: i + 1 })) };
    const snapshot = JSON.stringify(sampleSet);
    for (const asset of p.body.metering) {
      const profile = asset.profile, policy = profile.policy;
      const weights = sampleSet.samples.map((sample) => sample.areaWeight * (policy.kind === "highlight-weighted"
        ? policy.minimumWeightFraction + (1 - policy.minimumWeightFraction) * sample.relativeLinearSignal ** policy.exponent : 1));
      const expected = sampleSet.samples.reduce((sum, sample, i) => sum + sample.relativeLinearSignal * weights[i]!, 0)
        / weights.reduce((sum, weight) => sum + weight, 0);
      const result = meterRelativeExposure({ profile, sampleSet }).value;
      expect(result.status).toBe("resolved");
      if (result.status !== "resolved") throw Error("Reference meter must resolve");
      expect(result.meteredRelativeSignal).toBeCloseTo(expected, 12);
      expect(result.requiredExposureScaleToTarget).toBeCloseTo(.18 / expected, 12);
      const cropped = resolveCaptureGeometry({ ...base.sensor,
        outputCropRect: { x: 100, y: 100, width: 200, height: 100 }, outputRaster: { pixelWidth: 200, pixelHeight: 100 } }).value;
      expect(meterRelativeExposure({ profile, sampleSet: { ...sampleSet, captureGeometry: cropped } }).value.meteredRelativeSignal).toBe(result.meteredRelativeSignal);
      expect(result.outputCropUsedForMetering).toBe(false);
      expect(() => meterRelativeExposure({ profile, sampleSet: { ...sampleSet,
        processingState: { ...sampleSet.processingState, toneMappingApplied: true } } as unknown as ExposureMeteringSampleSet })).toThrow();
    }
    expect(JSON.stringify(sampleSet)).toBe(snapshot);
    expect(p.body.metering.map((asset) => asset.profile.policy.kind)).toEqual(tier === "consumer"
      ? ["multi-zone-uniform"] : ["multi-zone-uniform", "highlight-weighted"]);
  });
  it.each(GENERIC_EQUIPMENT_TIERS)("%s applies only advertised AWB policies to observable weighted signal", (tier) => {
    const profile = preset(tier).body.whiteBalance;
    const sampleSet: PreWhiteBalanceRgbSampleSet = { imageStateId: "tier-warm-patches",
      inputDomain: "relative-pre-wb-camera-linear-rgb", samples: [
        { sampleId: "a", red: 2, green: 1, blue: .5, weight: 1, clipped: false },
        { sampleId: "b", red: 4, green: 2, blue: 1, weight: 3, clipped: false },
        { sampleId: "clipped", red: 100, green: 1, blue: 1, weight: 100, clipped: true }
      ] };
    const snapshot = JSON.stringify(sampleSet);
    for (const policy of profile.awbPolicies) {
      const input = { stateId: "tier-awb-" + policy.policyId, profile, policyId: policy.policyId, sampleSet };
      const wb = estimateAutoWhiteBalance(input), strength = policy.correctionStrength.value;
      expect(wb.channelGains.red).toBeCloseTo(.5 ** strength, 12);
      expect(wb.channelGains.green).toBe(1);
      expect(wb.channelGains.blue).toBeCloseTo(2 ** strength, 12);
      expect(wb.measurement!.weightedMeanPreWbSignal).toEqual({ red: 3.5, green: 1.75, blue: .875 });
      expect(wb.measurement!.rejectedClippedSampleCount).toBe(1);
      expect(wb.trueIlluminantMetadataUsed).toBe(false);
      expect(wb.physicalExposureModified).toBe(false);
      expect(wb.rawCaptureDestructivelyModified).toBe(false);
      expect(estimateAutoWhiteBalance(input)).toEqual(wb);
      const locked = createLockedWhiteBalanceState({ stateId: "tier-awb-lock", sourceState: wb });
      expect(locked.locked).toBe(true);
      expect(locked.channelGains).toEqual(wb.channelGains);
    }
    if (tier === "consumer") expect(() => estimateAutoWhiteBalance({
      stateId: "unsupported", profile, policyId: "ambience", sampleSet })).toThrow();
    expect(JSON.stringify(sampleSet)).toBe(snapshot);
  });
  it.each(GENERIC_EQUIPMENT_TIERS)("%s keeps nonzero data-readout duration separate from spatial exposure skew", (tier) => {
    const readout = preset(tier).body.readoutTiming.profile;
    for (const shutterMechanism of ["mechanical", "electronic-first-curtain", "electronic"] as const) {
      const value = calculateSensorReadoutTiming({ nativeRaster: base.sensor.nativeRaster,
        shutterMechanism, readout, samplePointsNative: [{ x: 0, y: 0 }, { x: 300, y: 200 }, { x: 600, y: 400 }] }).value;
      expect(value.captureReadoutDurationSeconds.value).toBe(readout.captureReadoutDurationSeconds.value);
      expect(value.captureReadoutDurationSeconds.value).toBeGreaterThan(0);
      expect(value.scan).toBeNull();
      expect(value.maximumSpatialSamplingSkewSeconds).toBe(0);
      expect(value.samples.map((sample) => sample.readoutPhaseOffsetSeconds)).toEqual([0, 0, 0]);
    }
  });
});
