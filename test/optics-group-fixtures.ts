// SPDX-License-Identifier: Apache-2.0

import type { OpticalProfileState, GenericOpticalEvidence } from "../src/optics/profile-contract.js";
import type { LensStrayLightProfile, StrayLightSource } from "../src/optics/stray-light.js";
import type { AffineGeometricTransform, GeometricRaster, GeometricResampler } from "../src/output/geometric-transforms.js";
import type { GenericLensCorrectionProfile, IlluminationLensCorrection } from "../src/output/lens-corrections.js";

export const state: OpticalProfileState = { bodyId: "photivra-test-body", bodyVersion: "1", lensId: "photivra-test-lens", lensVersion: "1",
  focalLengthMm: 50, aperture: 4, focusDistanceM: 3, captureMode: "still", outputWidth: 5, outputHeight: 5,
  frameRateHz: 0, stabilizationMode: "off" };
export const evidence: GenericOpticalEvidence = { kind: "generic-parametric", basis: "Synthetic test parameters, independently authored.",
  residualNote: "No measured calibration or quantified physical uncertainty.",
  sources: [{ sourceOrigin: "photivra", sourceReference: "test:independent-synthetic-optics", reuseStatus: "photivra-owned" }] };
export const raster: GeometricRaster = { width: 5, height: 5, centerMm: { x: 0, y: 0 }, pitchMm: 1 };
export const resampler: GeometricResampler = { id: "test-linear", version: "1", filter: "bilinear", antialias: "source-prefiltered" };
export const transform: AffineGeometricTransform = { id: "warp", version: "1", domain: "reconstructed-linear",
  purpose: "breathing", kind: "affine", matrix: [1, 0, 0, 1], offsetMm: { x: 0, y: 0 } };
export const strayProfile: LensStrayLightProfile = { schemaVersion: "0.1.0", id: "clean-test", version: "1", state, evidence,
  interaction: "lens-reflections", wavelengthNm: 550, wavelengthBasis: "vacuum", maximumSourceAngleDegrees: 60,
  referenceEntranceAreaMm2: 100, responses: [
    { id: "reflection", kind: "ghost", centroidMmPerDegree: [-.02, 0, 0, -.02], offsetMm: { x: 1, y: 0 },
      sigmaMm: .5, axisPowerFraction: .01, angularSlope: 1 },
    { id: "scatter", kind: "veil", centroidMmPerDegree: [0, 0, 0, 0], offsetMm: { x: 0, y: 0 },
      sigmaMm: 10, axisPowerFraction: .02, angularSlope: 0 }
  ] };
export const source: StrayLightSource = { id: "off-frame", fieldAngleXDegrees: 50, fieldAngleYDegrees: 0,
  incidentSpectralPowerWPerNm: .001, admittedFraction: 1 };
export const gain: IlluminationLensCorrection = { id: "gain", version: "1", domain: "reconstructed-linear", kind: "peripheral-illumination",
  availability: "toggle", defaultEnabled: true, dependencies: [], requiredByStabilizationModes: [], residualNote: "Partial gain.",
  profile: { normalizationRadiusMm: 4, maximumNormalizedRadius: 1, coefficients: { r2: -.5, r4: 0, r6: 0 } }, strength: 1 };
export const correctionProfile: GenericLensCorrectionProfile = { schemaVersion: "0.1.0", id: "test-corrections", version: "1", state, evidence,
  components: [{ id: "geometry", version: "1", domain: "reconstructed-linear", kind: "geometry", transform,
    availability: "toggle", defaultEnabled: true, dependencies: [], requiredByStabilizationModes: [], residualNote: "Generic map." }, gain] };
