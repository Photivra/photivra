// SPDX-License-Identifier: Apache-2.0
import { type CalculateSensorPsfIrradianceQuadratureInput, type LensSampledPsfProfile } from "../../src/index.js";
import { sceneOpticalInput } from "./scene-optical-quadrature-fixture.js";
import { evidence } from "./eqe-response-fixture.js";

export function psfInput(time = 0, field: (x: number, y: number, nm: number) => number = () => 2): CalculateSensorPsfIrradianceQuadratureInput {
  const scene = sceneOpticalInput();
  const axes = { focalLengthMm: [50], focusDiopters: [0], apertureFNumber: [4], fieldXmm: [-20, 20],
    fieldYmm: [-20, 20], wavelengthNm: [400, 500], signedDefocusImagePlaneMicrometers: [0] };
  const kernel = { widthSamples: 3, heightSamples: 3, samplePitchMicrometersX: 100,
    samplePitchMicrometersY: 200, centerSampleX: 1, centerSampleY: 1,
    normalizedIntensity: [0,0,0,0,0.25,0.25,0,0.5,0] };
  const profile: LensSampledPsfProfile = { schemaVersion: "0.1.0", profileId: "owned-psf", profileVersion: "1",
    scientificStatus: "approximation", opticalDomain: "lens-primary-optical-path-only", coordinateSystem: "image-plane-metric",
    fieldAxes: "+X right, +Y up", kernelEnergyNormalization: "unit-energy-shape", interpolation: "bounded-regular-grid-multilinear",
    throughputOwnership: "separate-relative-pupil-throughput-factor", responseIncludes: {
      diffraction: true, aberration: true, defocus: true, pupilClippingShape: true },
    sensorOpticalStackIncluded: false, sensorSamplingIncluded: false, reconstructionIncluded: false,
    strayLightIncluded: false, axes, evidence: evidence("test:psf"), limitations: ["Owned synthetic local kernel."],
    nodes: axes.fieldXmm.flatMap(x => axes.fieldYmm.flatMap(y => axes.wavelengthNm.map(nm => ({
      nodeId: `psf-${x}-${y}-${nm}`, coordinate: { focalLengthMm: 50, focusDiopters: 0, apertureFNumber: 4,
        fieldXmm: x, fieldYmm: y, wavelengthNm: nm, signedDefocusImagePlaneMicrometers: 0 },
      kernel, bestFocusImagePlaneOffsetMicrometers: 0, relativePupilThroughputFactor: 0.6,
      evidence: evidence("test:psf-node"), uncertainty: { kind: "not-quantified" as const, limitation: "Synthetic." }
    })))) };
  return { timeSecondsFromOpeningReference: time, spatialQuadrature: scene.spatialQuadrature,
    spectralQuadrature: scene.spectralQuadrature, psf: { profile, focalLengthMm: 50,
      focus: { kind: "infinity" }, apertureFNumber: 4, signedDefocusImagePlaneMicrometers: 0 },
    psfWavelengthBasis: { value: "vacuum", evidence: evidence("test:psf-basis") },
    spatialModel: { kind: "destination-local-shift-invariant-approximation", evidence: evidence("test:isoplanatic"),
      limitation: "Only the declared finite synthetic neighborhood is represented." },
    inputMeaning: "pre-psf-pre-sensor-stack-pre-aa-spectral-irradiance",
    samples: scene.samples.map(s => {
      const p = scene.spatialQuadrature.nodes.find(p => p.antiAliasingComponentIndex === s.node.spatialNode.antiAliasingComponentIndex &&
        p.apertureSampleXIndex === s.node.spatialNode.apertureSampleXIndex && p.apertureSampleYIndex === s.node.spatialNode.apertureSampleYIndex)!;
      return { node: s.node, sourceSamples: Array.from({ length: 9 }, (_, i) => {
        const kernelSampleX = i%3, kernelSampleY = Math.floor(i/3);
        const x = p.preAntiAliasingSourcePointMm.x-(kernelSampleX-1)*100/1000;
        const y = p.preAntiAliasingSourcePointMm.y+(kernelSampleY-1)*200/1000;
        return { kernelSampleX, kernelSampleY, sourcePointNativeSensorMm: { x, y }, timeSecondsFromOpeningReference: time,
          spectralIrradianceWattsPerSquareMeterPerNanometer: field(x,y,s.node.wavelengthNanometers) };
      }) };
    }) };
}
