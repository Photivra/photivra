// SPDX-License-Identifier: Apache-2.0

import { parseSceneIlluminationProfile, parseSceneMaterialResponseProfile, parseSceneRadianceProviderProfile,
  calculateSensorSpatialSamplingQuadrature, calculateSensorSpectralQuadrature,
  type CalculateSceneToSensorIrradianceQuadratureInput, type CalculateSensorEqeLocalExposureInput } from "../../src/index.js";
import { input as sensorInput } from "./eqe-exposure-fixture.js";
import { evidence } from "./eqe-response-fixture.js";

/** Owned uniform spectral environment declarations; no measured scene or camera calibration. */
export function sceneOpticalInput(sensor: CalculateSensorEqeLocalExposureInput = sensorInput()): CalculateSceneToSensorIrradianceQuadratureInput {
  const spatialQuadrature = calculateSensorSpatialSamplingQuadrature({ ...sensor.spatialSampling,
    nativeRaster: sensor.localExposure.exposureWindowInput.nativeRaster,
    colorSamplingProfile: sensor.colorSamplingProfile, colorSamplingBindingProfile: sensor.localExposure.bindingProfile }).value;
  const spectralQuadrature = calculateSensorSpectralQuadrature({ ...sensor.spectralSampling,
    colorSamplingProfile: sensor.colorSamplingProfile, spectralResponseProfile: sensor.spectralResponseProfile }).value;
  return { spatialQuadrature, spectralQuadrature, timeSecondsFromExposureStart: 0,
    sceneBindings: {
      illuminationProfile: parseSceneIlluminationProfile({ schemaVersion: "0.1.0", profileId: "lights", sceneId: "room",
        evidence: evidence("test:lights"), sources: [{ sourceId: "sky", family: "environment", enabled: true,
          geometry: { kind: "environment" }, magnitude: { kind: "relative-linear-scale", scale: 1,
            scientificStatus: "approximation", limitation: "Owned synthetic scene declaration." },
          spectrum: { kind: "unresolved", limitation: "Numeric provider radiance is separately declared." },
          temporalBehavior: { kind: "time-invariant" }, evidence: evidence("test:sky") }] }),
      materialResponseProfile: parseSceneMaterialResponseProfile({ schemaVersion: "0.1.0", profileId: "materials", sceneId: "room",
        evidence: evidence("test:materials"), materials: [{ materialResponseId: "surface", evidence: evidence("test:surface"),
          representation: { kind: "spectral-wavelength-preserving-data", dataArtifact: { id: "owned-spectrum",
            checksumSha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" },
            wavelengthBasis: "vacuum", wavelengthRangeNanometers: { minimum: 400, maximum: 500 },
            scatteringModel: "provider-defined-wavelength-preserving", scientificStatus: "approximation",
            uncertainty: { kind: "not-quantified", limitation: "Synthetic provider metadata only." },
            wavelengthChangingBehaviorModeled: false, emissionModeled: false } }],
        fluorescenceModeled: false, volumetricMaterialTransportModeled: false, polarizationModeled: false }),
      providerProfile: parseSceneRadianceProviderProfile({ schemaVersion: "0.1.0", profileId: "provider", sceneId: "room",
        illuminationProfileId: "lights", materialResponseProfileId: "materials", outputQuantity: "outgoing-spectral-radiance",
        outputUnit: "W/m^2/sr/nm", scientificStatus: "approximation", uncertainty: { kind: "not-quantified", limitation: "Synthetic field." },
        fidelity: { spectral: "wavelength-resolved", material: "spectral-data", visibility: "resolved",
          directTransport: "approximation", indirectTransport: "not-modeled" }, wavelengthChangingTransportModeled: false,
        volumetricTransportModeled: false, polarizationModeled: false, evidence: evidence("test:provider"), limitations: ["Owned fixture declarations."] }) },
    optics: { profile: { schemaVersion: "0.1.0", profileId: "optics", profileVersion: "1", lensProfileId: "lens",
      scientificStatus: "approximation", applicability: { focalLengthMm: { minimum: 50, maximum: 50 },
        nominalFNumber: { minimum: 2, maximum: 8 }, focus: { kind: "any" } },
      transmission: { kind: "spectral-transmission", scientificStatus: "approximation", wavelengthBasis: "vacuum",
        samples: { value: [{ wavelengthNanometers: 400, linearTransmissionFactor: 0.8 },
          { wavelengthNanometers: 500, linearTransmissionFactor: 0.4 }], evidence: evidence("test:transmission") },
        uncertainty: { kind: "not-quantified", limitation: "Synthetic optical curve." } },
      distortionAreaMappingOwnership: "not-applied-by-bridge", psfRedistributionOwnership: "downstream-normalized-energy-redistribution",
      sensorOpticalStackIncluded: false, strayLightIncluded: false, polarizationModeled: false, wavelengthChangingBehaviorModeled: false,
      volumetricScatteringModeled: false, evidence: evidence("test:optics"), limitations: ["Paraxial test model."] },
      focalLengthMm: 50, nominalFNumber: 4, focus: { kind: "infinity-focus" } },
    samples: spectralQuadrature.nodes.flatMap(s => spatialQuadrature.nodes.map((p, i) => {
      const sampleId = `sample-${s.spectralSampleIndex}-${i}`;
      return { node: { spatialNode: { antiAliasingComponentIndex: p.antiAliasingComponentIndex,
        apertureSampleXIndex: p.apertureSampleXIndex, apertureSampleYIndex: p.apertureSampleYIndex },
        spectralSampleIndex: s.spectralSampleIndex, wavelengthNanometers: s.wavelengthNanometers },
        sceneRadianceRequest: { schemaVersion: "0.1.0", sampleId, providerProfileId: "provider", sceneId: "room",
          illuminationProfileId: "lights", materialResponseProfileId: "materials", target: { kind: "environment-direction",
            outgoingDirectionUnitVector: { x: 0, y: 0, z: 1 } }, timeSecondsFromExposureStart: 0,
          wavelengthNanometers: s.wavelengthNanometers, wavelengthBasis: "vacuum" },
        sceneRadianceResult: { schemaVersion: "0.1.0", sampleId, providerProfileId: "provider", sceneId: "room",
          wavelengthNanometers: s.wavelengthNanometers, wavelengthBasis: "vacuum", quantity: "outgoing-spectral-radiance",
          unit: "W/m^2/sr/nm", spectralRadianceWattsPerSquareMeterSteradianNanometer: 2,
          scientificStatus: "approximation", uncertainty: { kind: "not-quantified", limitation: "Uniform synthetic field." },
          evidence: evidence("test:uniform-field"), limitations: ["Declared uniform environment field, not projection validation."] },
        fieldThroughput: { kind: "unity" } };
    })) };
}
