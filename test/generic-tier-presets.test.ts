// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  GENERIC_EQUIPMENT_TIERS, resolveGenericEquipmentTierCatalog,
  createGenericEquipmentTierSelection, parseGenericEquipmentTierSelection,
  resolveGenericEquipmentTierLensProfiles, calculateLensComplexPupilPsf,
  calculateIlluminationVignetting, calculatePeripheralIlluminationCorrection,
  resolveLensCorrectionPlan, calculateLensCorrectedCapture, resolveGenericIsoSignalChain,
  calculateLensStrayLightIrradiance, calculateStabilizedRotationTrajectory,
  calculateLateralChromaticAberrationMapping, calculateRadialDistortionMapping,
  type GenericEquipmentTier, type OpticalProfileState
} from "../src/index.js";
import { loadBasicReferenceFixture } from "./helpers/basic-reference-fixture.js";

const baseline = loadBasicReferenceFixture();
const catalog = resolveGenericEquipmentTierCatalog({ presetVersion: "1.0.0" });
function state(bodyTier: GenericEquipmentTier, lensTier = bodyTier, size = 9): OpticalProfileState {
  return { bodyId: `photivra-${bodyTier}-body`, bodyVersion: "1.0.0", lensId: `photivra-${lensTier}-prime`, lensVersion: "1.0.0",
    focalLengthMm: baseline.lens.focalLengthMm, aperture: baseline.lens.aperture, focusDistanceM: baseline.focus.distanceM,
    captureMode: "still", outputWidth: size, outputHeight: size, frameRateHz: 0, stabilizationMode: "off" };
}
function profiles(tier: GenericEquipmentTier): ReturnType<typeof resolveGenericEquipmentTierLensProfiles> {
  return resolveGenericEquipmentTierLensProfiles({ selection: createGenericEquipmentTierSelection({ presetVersion: "1.0.0", bodyTier: tier }), state: state(tier) });
}

describe("versioned generic tier reference assets", () => {
  it("pins the complete manifest against silent retuning at the same version", () => {
    const fixture = JSON.parse(readFileSync(new URL("./fixtures/generic-tier-assets-v1.json", import.meta.url), "utf8")) as { presetVersion: string; catalogSha256: string };
    expect(fixture.presetVersion).toBe("1.0.0");
    expect(createHash("sha256").update(JSON.stringify(catalog)).digest("hex")).toBe(fixture.catalogSha256);
    expect(catalog.map((p) => p.label)).toEqual(["Consumer", "Prosumer", "Professional"]);
    expect(catalog.every((p) => p.scientificStatus === "approximation")).toBe(true);
    expect(Object.isFrozen(catalog[0]!.lens.matchedReference.pupilAmplitudeByField[0])).toBe(true);
  });
  it("keeps all nine body/lens pairings valid without selecting sensor geometry", () => {
    for (const bodyTier of GENERIC_EQUIPMENT_TIERS) for (const lensTier of GENERIC_EQUIPMENT_TIERS) {
      const selection = createGenericEquipmentTierSelection({ presetVersion: "1.0.0", bodyTier, lensTier });
      expect(parseGenericEquipmentTierSelection(JSON.parse(JSON.stringify(selection)))).toEqual(selection);
      expect(selection.sensorFormatSelectedByTier).toBe(false);
      expect(selection.scientificTierMultiplierApplied).toBe(false);
      expect(resolveGenericEquipmentTierLensProfiles({ selection, state: state(bodyTier, lensTier) }).selection).toEqual(selection);
    }
  });
  it("rejects unknown versions and saved profile drift rather than substituting defaults", () => {
    expect(() => resolveGenericEquipmentTierCatalog({ presetVersion: "latest" })).toThrow();
    const selection = createGenericEquipmentTierSelection({ presetVersion: "1.0.0", bodyTier: "consumer" });
    for (const modified of [ { ...selection, presetVersion: "0.9.0" }, { ...selection, bodyPresetId: "other" },
      { ...selection, profileReferences: selection.profileReferences.slice(1) },
      { ...selection, profileReferences: selection.profileReferences.map((r, i) => i ? r : { ...r, profileVersion: "1.0.1" }) },
      { ...selection, lensTier: undefined }, { ...selection, lensTier: null }, { ...selection, scientificTierMultiplierApplied: true }, { ...selection, quality: 1 } ]) {
      expect(() => parseGenericEquipmentTierSelection(modified)).toThrow();
    }
    const sparse = Array(selection.profileReferences.length) as typeof selection.profileReferences;
    expect(() => parseGenericEquipmentTierSelection({ ...selection, profileReferences: sparse })).toThrow();
  });
  it("fails closed outside the finite optical reference even if exposure capabilities support it", () => {
    const selection = createGenericEquipmentTierSelection({ presetVersion: "1.0.0", bodyTier: "consumer" });
    for (const change of [{ aperture: 8 }, { focalLengthMm: 35 }, { focusDistanceM: 3 }, { bodyVersion: "2" },
      { stabilizationMode: "sensor-shift" }, { captureMode: "video" as const, frameRateHz: 24 }]) {
      expect(() => resolveGenericEquipmentTierLensProfiles({ selection, state: { ...state("consumer"), ...change } })).toThrow();
    }
  });
  it("resolves every advertised ISO setting into an explicit readout regime without changing photons", () => {
    for (const preset of catalog) {
      const b = preset.body;
      const grid = b.iso.standard.settingGrid;
      if (grid.kind !== "discrete-values") throw new Error("Expected finite matched ISO grid");
      for (const exposureIndex of grid.values) for (const channel of b.readout) {
        const result = resolveGenericIsoSignalChain({ profile: b.signalChain, isoCapability: b.iso,
          requestedIsoSetting: { kind: "standard", exposureIndex }, captureModeId: "native-still", readoutProfile: channel.profile });
        expect(result.capturedPhotonExpectationModified).toBe(false);
        expect(result.photonShotNoiseStatisticsModified).toBe(false);
        expect(result.isoUsedAsDirectNoiseEquation).toBe(false);
      }
    }
  });
  it("evaluates matched body stabilization through the ordinary response model", () => {
    const disturbance = { version: "0.1.0" as const, trajectoryId: "matched-disturbance", timeReference: "first-opening-boundary-phase" as const,
      initialAngularDisplacementIsZero: true as const, cameraTranslationIncluded: false as const,
      subjectMotionIncluded: false as const, supportStateEncoded: false as const, evidence: catalog[0]!.evidence, limitations: ["Synthetic matched disturbance."],
      samples: [ { timeSecondsFromCaptureReference: 0, angularDisplacementRad: { pitch: 0, yaw: 0, roll: 0 } },
        { timeSecondsFromCaptureReference: baseline.exposure.shutterSeconds, angularDisplacementRad: { pitch: .004, yaw: .002, roll: .001 } } ] };
    const residuals = catalog.map((p) => calculateStabilizedRotationTrajectory({ disturbance, profile: p.body.stabilization, captureKind: "still" }).value.samples[1]!.residualAngularDisplacementRad.pitch);
    expect(residuals[0]).toBeCloseTo(.002775, 12);
    expect(residuals[1]).toBeCloseTo(.001725, 12);
    expect(residuals[2]).toBeCloseTo(.001025, 12);
  });
  it("compares physical radial/CA outputs at the same corner without double-applying the base", () => {
    const separations = GENERIC_EQUIPMENT_TIERS.map((tier) => {
      const p = profiles(tier), imagePointMm = { x: 18, y: 12 };
      const radial = calculateRadialDistortionMapping({ profile: p.radial, imagePointMm }).value;
      const ca = calculateLateralChromaticAberrationMapping({ profile: p.lateralCa, imagePointMm }).value;
      expect(ca.channels.green.mappedImagePointMm).toEqual(radial.mappedImagePointMm);
      return ca.separation.maximumPairDistanceMm;
    });
    expect(separations[0]).toBeGreaterThan(separations[1]!);
    expect(separations[1]).toBeGreaterThan(separations[2]!);
  });
  it("compares separate ghost/veil additions for one off-frame source without remetering", () => {
    const additions = GENERIC_EQUIPMENT_TIERS.map((tier) => {
      const p = profiles(tier);
      const result = calculateLensStrayLightIrradiance({ profile: p.stray, state: p.state, enabled: true, imagePointMm: { x: 0, y: 0 },
        wavelengthNm: 550, wavelengthBasis: "vacuum", timeSeconds: baseline.exposure.shutterSeconds,
        primarySpectralIrradianceWPerM2PerNm: 1, sources: [{ id: "matched-off-frame", fieldAngleXDegrees: 50, fieldAngleYDegrees: 0,
          incidentSpectralPowerWPerNm: .001, admittedFraction: 1 }], meterDomain: "primary-only" }).value;
      expect(result.meterSpectralIrradianceWPerM2PerNm).toBe(1);
      expect(result.ghostSpectralIrradianceWPerM2PerNm).toBeGreaterThan(0);
      expect(result.veilSpectralIrradianceWPerM2PerNm).toBeGreaterThan(0);
      return result.totalSpectralIrradianceWPerM2PerNm;
    });
    expect(additions[0]).toBeGreaterThan(additions[1]!);
    expect(additions[1]).toBeGreaterThan(additions[2]!);
  });
  it.each(GENERIC_EQUIPMENT_TIERS)("%s pupil grid preserves unit shape energy and separate throughput at all nine slices", (tier) => {
    const p = profiles(tier);
    expect(p.pupils).toHaveLength(9);
    for (const pupil of p.pupils) {
      const psf = calculateLensComplexPupilPsf({ profile: pupil }).value;
      expect(psf.kernel.normalizedIntensity.reduce((sum, v) => sum + v, 0)).toBeCloseTo(1, 13);
      expect(psf.relativePupilThroughputFactor).toBeGreaterThan(0);
      expect(psf.relativePupilThroughputFactor).toBeLessThanOrEqual(1);
      expect(psf.pupilClippingThroughputAppliedToKernel).toBe(false);
      expect(psf.scalarSharpnessScoreProduced).toBe(false);
      expect(psf.context.wavelengthNm).toBe(baseline.illumination.wavelengthNm);
    }
  });
  it("retains two-dimensional field/near/far character instead of one blur score", () => {
    const c = profiles("consumer"), p = profiles("professional");
    const kernel = (index: number, profile = c): readonly number[] => calculateLensComplexPupilPsf({ profile: profile.pupils[index]! }).value.kernel.normalizedIntensity;
    expect(kernel(1)).not.toEqual(kernel(7));
    expect(kernel(0)).not.toEqual(kernel(1));
    expect(kernel(0, p)).not.toEqual(kernel(2, p));
    expect(c.pupils[7]!.relativePupilThroughputFactor).toBeLessThan(p.pupils[7]!.relativePupilThroughputFactor);
  });
  it("exposes a declared Professional/Prosumer falloff and gain-cost tradeoff", () => {
    const costs = ["prosumer", "professional"].map((tier) => {
      const p = profiles(tier as GenericEquipmentTier);
      const illumination = calculateIlluminationVignetting({ profile: p.vignetting, imagePointMm: { x: 18, y: 12 } }).value;
      const gain = p.correction.components.find((c) => c.kind === "peripheral-illumination")!;
      if (gain.kind !== "peripheral-illumination") throw new Error("Missing gain");
      return { illumination, correction: calculatePeripheralIlluminationCorrection({ component: gain, imagePointMm: { x: 18, y: 12 }, signal: 1, noiseVariance: 1, clippingLevel: 100 }).value };
    });
    expect(costs[1]!.illumination.linearThroughputFactor).toBeLessThan(costs[0]!.illumination.linearThroughputFactor);
    expect(costs[1]!.correction.noiseVarianceBeforeClipping).toBeGreaterThan(costs[0]!.correction.noiseVarianceBeforeClipping);
  });
  it.each(GENERIC_EQUIPMENT_TIERS)("%s correction A/B preserves the same sampled signal, noise identity and capture", (tier) => {
    const p = profiles(tier), raster = { width: 9, height: 9, centerMm: { x: 0, y: 0 }, pitchMm: 3 };
    // Deterministic sampled ramp plus alternating noise; no new realization for On.
    const samples = Array.from({ length: 81 }, (_, i) => 1 + i * .01 + (i % 2 ? .002 : -.002));
    const capture = { state: p.state, captureId: "matched-reference-capture", noiseRealizationId: "fixed-noise-42", timeSeconds: baseline.exposure.shutterSeconds,
      raster, channels: { red: samples, green: samples, blue: samples } };
    const render = (enabled: boolean, shiftMm = 0): ReturnType<typeof calculateLensCorrectedCapture>["value"] => calculateLensCorrectedCapture({
      plan: resolveLensCorrectionPlan({ profile: p.correction, state: p.state, selections: { geometry: enabled ? "on" : "off", "lateral-ca": enabled ? "on" : "off", gain: enabled ? "on" : "off" },
        outputKind: "processed", selectionKind: "camera-selectable" }).value,
      capture, destinationRaster: { ...raster, centerMm: { x: shiftMm, y: 0 } }, resampler: { id: "matched-reference-bilinear", version: "1", filter: "bilinear", antialias: "source-prefiltered" },
      physicalProjectionDistanceMm: baseline.expected.projection.imageDistanceMm, clippingLevel: 100 }).value;
    const original = [...samples], off = render(false), on = render(true);
    expect(off.channels.red).toEqual(samples);
    expect(on.channels.red).not.toEqual(off.channels.red);
    expect(on.captureId).toBe(off.captureId);
    expect(on.noiseRealizationId).toBe(off.noiseRealizationId);
    expect(on.timeSeconds).toBe(off.timeSeconds);
    expect(samples).toEqual(original);
    expect(on).toEqual(render(true));
    expect(on.samplingPlans.red).toBeDefined();
    const sampling = on.samplingPlans.red!;
    expect(sampling.requiresPrefilter).toBe(false);
    expect(sampling.points.every((point) => point.determinant > 0 && point.principalStretches[0] < 2)).toBe(true);
    expect(sampling.points.every((point) => point.jacobian.length === 4)).toBe(true);
    expect(sampling.retainedSampleRayEnvelopeDegrees).not.toBeNull();
    expect(on.validSourceMask.filter(Boolean).length).toBeGreaterThan(0);
    const shifted = render(true, 6);
    expect(shifted.validSourceMask.filter(Boolean).length).toBeLessThan(81);
    expect(shifted.channels.red.some((sample) => sample === null)).toBe(true);
    expect(shifted.jointCrop!.width * shifted.jointCrop!.height).toBeLessThan(81);
    expect(on.validSourceMask).toHaveLength(81);
    expect(on.jointCrop).not.toBeNull();
  });
});
