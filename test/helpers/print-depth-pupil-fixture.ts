// SPDX-License-Identifier: Apache-2.0
import { calculateLensComplexPupilPsf, calculateThinLensImageDistance, parseLensComplexPupilProfile, type LensPsfKernel } from "../../src/index.js";
const evidence = [{ sourceOrigin: "photivra" as const, sourceReference: "owned finite pupil and visible metric planes", reuseStatus: "photivra-owned" as const }];
const focusImageMm = calculateThinLensImageDistance({ focalLengthMm: 50, objectDistanceM: 5 }).value.imageDistanceMm;
/** Owned ideal paraxial pupil. Explicit padding controls image-plane sampling;
 * changing the pupil resolution alone does not cure intensity aliasing. */
export function ownedDepthPupilKernel(subjectDistanceM: number, apertureFNumber: number, n = 9, radiusSamples = 4): LensPsfKernel {
  const objectImageMm = calculateThinLensImageDistance({ focalLengthMm: 50, objectDistanceM: subjectDistanceM }).value.imageDistanceMm;
  const fieldXmm = { 2: -.66, 5: 0, 10: .66 }[subjectDistanceM]!;
  const center = (n - 1) / 2, radius = 50 / (2 * apertureFNumber), pitch = radius / radiusSamples;
  const amplitude = Array.from({ length: n * n }, (_, i) => ((i % n - center) * pitch)**2 + ((Math.floor(i/n) - center) * pitch)**2 <= radius**2 ? 1 : 0);
  // Explicit paraxial wavefront path difference in an owned ideal pupil. Shared
  // thin-lens distances supply focus geometry; no scalar blur radius is converted
  // into a kernel. The finite pupil backend jointly propagates diffraction/defocus.
  const opd = amplitude.map((_, i) => (((i % n - center) * pitch)**2 + ((Math.floor(i/n) - center) * pitch)**2) / 2 *
    (1 / focusImageMm - 1 / objectImageMm) * 1000);
  return calculateLensComplexPupilPsf({ propagationDistanceMm: focusImageMm, profile: parseLensComplexPupilProfile({ schemaVersion: "0.1.0", profileId: "owned-depth-pupil",
    profileVersion: "0.1.0", scientificStatus: "approximation", opticalDomain: "lens-primary-optical-path-only", representation: "complex-pupil-amplitude-plus-opd",
    pupilCoordinateSystem: "pupil-plane-metric-aligned-to-image-plane", imageFieldAxes: "+X right, +Y up", amplitudeMeaning: "relative-complex-pupil-amplitude-shape",
    wavefrontMeaning: "optical-path-difference-micrometers", throughputOwnership: "separate-relative-pupil-throughput-factor", kernelEnergyNormalization: "unit-energy-shape",
    propagationModel: "scalar-fraunhofer-discrete-reference", context: { focalLengthMm: 50, focus: { kind: "finite", distanceM: 5 },
      apertureFNumber: apertureFNumber, fieldPointMm: { x: fieldXmm, y: 0 }, wavelengthNm: 500,
      signedDefocusImagePlaneMicrometers: (focusImageMm - objectImageMm) * 1000 },
    responseIncludes: { diffraction: true, aberration: false, defocus: true, pupilClippingShape: true }, relativePupilThroughputFactor: 1,
    grid: { widthSamples: n, heightSamples: n, pupilSamplePitchMmX: pitch, pupilSamplePitchMmY: pitch, centerSampleX: center, centerSampleY: center,
      relativeAmplitude: amplitude, opticalPathDifferenceMicrometers: opd }, sensorOpticalStackIncluded: false, sensorSamplingIncluded: false,
    reconstructionIncluded: false, strayLightIncluded: false, evidence, uncertainty: { kind: "not-quantified", limitation: "Owned finite pupil; no lens calibration." },
    limitations: ["Owned paraxial field-invariant ideal pupil. Finite discrete scalar pupil; no continuum optics certificate or depth-edge PSF composition."] }) }).value.kernel;
}
