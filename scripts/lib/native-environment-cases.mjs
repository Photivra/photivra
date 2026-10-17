// SPDX-License-Identifier: Apache-2.0

/**
 * Repository-only `simulateCapture()` cases shared by the native environment benchmarks (#275): the facade's
 * default optics, a 3 × 3 sampled lens PSF, radial distortion (a lens field mapping) and ideal pupil rays, all on
 * the slanted-edge scene, plus an analytic radiance function for tasks run outside the facade.
 */
const evidence = [{ sourceOrigin: "photivra", sourceReference: "photivra:benchmark-native-environment", reuseStatus: "photivra-owned" }];

/** Synthetic binomial 3 × 3 kernel at the pixel pitch, bound to the facade defaults (50 mm, f/8, focus 5 m). */
function sampledPsf() {
  const axes = { focalLengthMm: [50], focusDiopters: [0.2], apertureFNumber: [8], fieldXmm: [-1, 1], fieldYmm: [-1, 1], wavelengthNm: [380, 780],
    signedDefocusImagePlaneMicrometers: [0] };
  const kernel = { widthSamples: 3, heightSamples: 3, samplePitchMicrometersX: 6, samplePitchMicrometersY: 6, centerSampleX: 1, centerSampleY: 1,
    normalizedIntensity: [0.0625, 0.125, 0.0625, 0.125, 0.25, 0.125, 0.0625, 0.125, 0.0625] };
  const profile = { schemaVersion: "0.1.0", profileId: "benchmark-binomial-psf", profileVersion: "1", scientificStatus: "approximation",
    opticalDomain: "lens-primary-optical-path-only", coordinateSystem: "image-plane-metric", fieldAxes: "+X right, +Y up",
    kernelEnergyNormalization: "unit-energy-shape", interpolation: "bounded-regular-grid-multilinear",
    throughputOwnership: "separate-relative-pupil-throughput-factor",
    responseIncludes: { diffraction: true, aberration: true, defocus: true, pupilClippingShape: true }, sensorOpticalStackIncluded: false,
    sensorSamplingIncluded: false, reconstructionIncluded: false, strayLightIncluded: false, axes, evidence,
    limitations: ["Synthetic binomial kernel for a benchmark."],
    nodes: axes.fieldXmm.flatMap((x) => axes.fieldYmm.flatMap((y) => axes.wavelengthNm.map((nm) => ({ nodeId: `n-${x}-${y}-${nm}`,
      coordinate: { focalLengthMm: 50, focusDiopters: 0.2, apertureFNumber: 8, fieldXmm: x, fieldYmm: y, wavelengthNm: nm,
        signedDefocusImagePlaneMicrometers: 0 },
      kernel, bestFocusImagePlaneOffsetMicrometers: 0, relativePupilThroughputFactor: 1, evidence,
      uncertainty: { kind: "not-quantified", limitation: "Synthetic." } })))) };
  return { kind: "sampled-local", configuration: { psf: { profile, focalLengthMm: 50, focus: { kind: "finite", distanceM: 5 }, apertureFNumber: 8,
    signedDefocusImagePlaneMicrometers: 0 }, psfWavelengthBasis: { value: "vacuum", evidence },
  spatialModel: { kind: "destination-local-shift-invariant-approximation", evidence, limitation: "Synthetic local kernel." } } };
}

/** The `simulateCapture()` options of each case at an N × N output. */
export function nativeEnvironmentCases(size) {
  const base = { scene: { preset: "slanted-edge" }, output: { width: size, height: size }, sensor: { noiseSeed: 7 } };
  return {
    default: base,
    psf: { ...base, lens: { psf: sampledPsf() } },
    distortion: { ...base, lens: { distortion: { kind: "radial", profile: { normalizationRadiusMm: 0.5, maximumNormalizedRadius: 1,
      coefficients: { k1: -0.05, k2: 0, k3: 0 } } } } },
    pupil: { ...base, lens: { pupilSampling: { radialSamples: 1, angularSamples: 4 } } }
  };
}

/** A deterministic analytic radiance result for any request (and optional aperture ray). */
export function analyticRadiance(request, ray) {
  const d = request.target.kind === "environment-direction" ? request.target.outgoingDirectionUnitVector : { x: 0, y: 0, z: 1 };
  const radiance = 0.02 * (1 + 0.6 * Math.sin(900 * d.x) * Math.cos(700 * d.y)) * (0.5 + request.wavelengthNanometers / 1000) *
    (ray ? 1 + 0.1 * ray.pupilSampleIndex : 1);
  return { schemaVersion: "0.1.0", sampleId: request.sampleId, sceneId: request.sceneId, providerProfileId: request.providerProfileId,
    wavelengthNanometers: request.wavelengthNanometers, wavelengthBasis: request.wavelengthBasis, quantity: "outgoing-spectral-radiance",
    unit: "W/m^2/sr/nm", spectralRadianceWattsPerSquareMeterSteradianNanometer: radiance, scientificStatus: "approximation",
    uncertainty: { kind: "not-quantified", limitation: "Analytic benchmark field." }, evidence, limitations: ["Analytic benchmark field."] };
}
