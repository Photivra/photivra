// SPDX-License-Identifier: Apache-2.0

import {
  parseLensComplexPupilProfile,
  type LensComplexPupilGrid,
  type LensComplexPupilProfile
} from "../../src/index.js";

/** Synthetic Photivra-owned complex-pupil profile around a caller-built grid. */
export function complexPupilProfileForGrid(
  grid: LensComplexPupilGrid,
  options: { focalLengthMm?: number; apertureFNumber?: number; wavelengthNm?: number } = {}
): LensComplexPupilProfile {
  return parseLensComplexPupilProfile({
    schemaVersion: "0.1.0",
    profileId: "synthetic-wavefront",
    profileVersion: "1.0.0",
    scientificStatus: "approximation",
    opticalDomain: "lens-primary-optical-path-only",
    representation: "complex-pupil-amplitude-plus-opd",
    pupilCoordinateSystem: "pupil-plane-metric-aligned-to-image-plane",
    imageFieldAxes: "+X right, +Y up",
    amplitudeMeaning: "relative-complex-pupil-amplitude-shape",
    wavefrontMeaning: "optical-path-difference-micrometers",
    throughputOwnership: "separate-relative-pupil-throughput-factor",
    kernelEnergyNormalization: "unit-energy-shape",
    propagationModel: "scalar-fraunhofer-discrete-reference",
    context: {
      focalLengthMm: options.focalLengthMm ?? 50,
      focus: { kind: "infinity" },
      apertureFNumber: options.apertureFNumber ?? 4,
      fieldPointMm: { x: 0, y: 0 },
      wavelengthNm: options.wavelengthNm ?? 550,
      signedDefocusImagePlaneMicrometers: 0
    },
    responseIncludes: { diffraction: true, aberration: true, defocus: false, pupilClippingShape: false },
    relativePupilThroughputFactor: 1,
    grid,
    sensorOpticalStackIncluded: false,
    sensorSamplingIncluded: false,
    reconstructionIncluded: false,
    strayLightIncluded: false,
    evidence: [{ sourceOrigin: "photivra", sourceReference: "synthetic-wavefront-test", reuseStatus: "photivra-owned" }],
    uncertainty: { kind: "not-quantified", limitation: "Synthetic test pupil." },
    limitations: ["Synthetic wavefront test profile."]
  });
}
