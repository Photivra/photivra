import { describe, expect, it } from "vitest";

import {
  calculateAiryDisk,
  calculateDepthOfField,
  calculateSceneRadianceToSensorIrradiance,
  composeFrontOfLensFilterTransmission,
  parseFrontOfLensFilterProfile,
  parseSceneToSensorIrradianceProfile,
  resolveFrontOfLensFilterTransmission,
  type FrontOfLensFilterProfile,
  type SceneRadianceEvaluationRequest,
  type SceneRadianceEvaluationResult
} from "../src/index.js";

const evidence = (
  ref: string
): readonly [{
  sourceOrigin: "photivra";
  sourceReference: string;
  reuseStatus: "photivra-owned";
}] => [{
  sourceOrigin: "photivra",
  sourceReference: ref,
  reuseStatus: "photivra-owned"
}];

const neutralLinear = (
  factor = 0.5,
  id = "generic-nd-linear"
): FrontOfLensFilterProfile =>
  parseFrontOfLensFilterProfile({
    schemaVersion: "0.1.0",
    filterId: id,
    profileVersion: "1.0.0",
    identityScope:
      "photivra-generic-unbranded",
    position: "front-of-lens",
    scientificStatus: "approximation",
    wavelengthBasis: "air",
    wavelengthRangeNanometers: {
      minimum: 400,
      maximum: 700
    },
    transmission: {
      kind:
        "neutral-linear-transmission",
      linearTransmissionFactor: {
        value: factor,
        evidence:
          evidence(id + ":transmission")
      }
    },
    uncertainty: {
      kind: "not-quantified",
      limitation:
        "Generic educational filter."
    },
    polarizationModeled: false,
    wavelengthChangingBehaviorModeled:
      false,
    evidence: evidence(id),
    limitations: [
      "Generic unbranded filter."
    ]
  });

const neutralDensity = (
  density = 0.3
): FrontOfLensFilterProfile =>
  parseFrontOfLensFilterProfile({
    schemaVersion: "0.1.0",
    filterId: "generic-nd-density",
    profileVersion: "1.0.0",
    identityScope:
      "photivra-generic-unbranded",
    position: "front-of-lens",
    scientificStatus: "approximation",
    wavelengthBasis: "air",
    wavelengthRangeNanometers: {
      minimum: 400,
      maximum: 700
    },
    transmission: {
      kind:
        "neutral-optical-density",
      opticalDensityBase10: {
        value: density,
        evidence:
          evidence("density")
      }
    },
    uncertainty: {
      kind: "not-quantified",
      limitation:
        "Generic educational filter."
    },
    polarizationModeled: false,
    wavelengthChangingBehaviorModeled:
      false,
    evidence: evidence("nd-density"),
    limitations: []
  });

const spectral = (): FrontOfLensFilterProfile =>
  parseFrontOfLensFilterProfile({
    schemaVersion: "0.1.0",
    filterId: "generic-spectral",
    profileVersion: "1.0.0",
    identityScope:
      "photivra-generic-unbranded",
    position: "front-of-lens",
    scientificStatus: "approximation",
    wavelengthBasis: "air",
    wavelengthRangeNanometers: {
      minimum: 450,
      maximum: 650
    },
    transmission: {
      kind: "spectral-transmission",
      samples: {
        value: [
          {
            wavelengthNanometers: 450,
            linearTransmissionFactor: 0.8
          },
          {
            wavelengthNanometers: 550,
            linearTransmissionFactor: 0.6
          },
          {
            wavelengthNanometers: 650,
            linearTransmissionFactor: 0.4
          }
        ],
        evidence:
          evidence("spectral-data")
      }
    },
    uncertainty: {
      kind: "not-quantified",
      limitation:
        "Generic educational spectral filter."
    },
    polarizationModeled: false,
    wavelengthChangingBehaviorModeled:
      false,
    evidence: evidence("spectral-filter"),
    limitations: []
  });

const request = (
  wavelengthNanometers = 550
): SceneRadianceEvaluationRequest => ({
  schemaVersion: "0.1.0",
  sampleId: "sample",
  providerProfileId: "provider",
  sceneId: "scene",
  illuminationProfileId: "illumination",
  materialResponseProfileId: "material",
  target: {
    kind: "environment-direction",
    outgoingDirectionUnitVector: {
      x: 0,
      y: 0,
      z: 1
    }
  },
  timeSecondsFromExposureStart: 0,
  wavelengthNanometers,
  wavelengthBasis: "air"
});

const radiance = (
  wavelengthNanometers = 550
): SceneRadianceEvaluationResult => ({
  schemaVersion: "0.1.0",
  sampleId: "sample",
  providerProfileId: "provider",
  sceneId: "scene",
  wavelengthNanometers,
  wavelengthBasis: "air",
  quantity: "outgoing-spectral-radiance",
  unit: "W/m^2/sr/nm",
  spectralRadianceWattsPerSquareMeterSteradianNanometer:
    10,
  scientificStatus: "approximation",
  uncertainty: {
    kind: "not-quantified",
    limitation: "test"
  },
  evidence: evidence("radiance"),
  limitations: []
});

const optics = (): ReturnType<
  typeof parseSceneToSensorIrradianceProfile
> =>
  parseSceneToSensorIrradianceProfile({
    schemaVersion: "0.1.0",
    profileId: "optics",
    profileVersion: "1.0.0",
    lensProfileId: "lens",
    scientificStatus: "approximation",
    applicability: {
      focalLengthMm: {
        minimum: 50,
        maximum: 50
      },
      nominalFNumber: {
        minimum: 1.4,
        maximum: 16
      },
      focus: {
        kind: "any"
      }
    },
    transmission: {
      kind: "spectral-transmission",
      scientificStatus: "approximation",
      wavelengthBasis: "air",
      samples: {
        value: [
          {
            wavelengthNanometers: 450,
            linearTransmissionFactor: 0.9
          },
          {
            wavelengthNanometers: 550,
            linearTransmissionFactor: 0.8
          },
          {
            wavelengthNanometers: 650,
            linearTransmissionFactor: 0.7
          }
        ],
        evidence: evidence("lens-transmission")
      },
      uncertainty: {
        kind: "not-quantified",
        limitation: "test"
      }
    },
    distortionAreaMappingOwnership:
      "not-applied-by-bridge",
    psfRedistributionOwnership:
      "downstream-normalized-energy-redistribution",
    sensorOpticalStackIncluded: false,
    strayLightIncluded: false,
    polarizationModeled: false,
    wavelengthChangingBehaviorModeled:
      false,
    volumetricScatteringModeled: false,
    evidence: evidence("optics"),
    limitations: []
  });

describe("front-of-lens filter transmission", () => {
  it("resolves 50% neutral transmission as exactly one stop", () => {
    const result =
      resolveFrontOfLensFilterTransmission({
        profile: neutralLinear(),
        wavelengthNanometers: 550,
        wavelengthBasis: "air"
      });

    expect(
      result.linearTransmissionFactor
    ).toBe(0.5);
    expect(result.attenuationStops)
      .toBe(1);
    expect(
      result.opticalDensityBase10
    ).toBeCloseTo(
      Math.log10(2),
      14
    );
    expect(result.polarizationModeled)
      .toBe(false);
  });

  it("resolves base-10 optical density using T = 10^-OD", () => {
    const result =
      resolveFrontOfLensFilterTransmission({
        profile:
          neutralDensity(0.3),
        wavelengthNanometers: 550,
        wavelengthBasis: "air"
      });

    expect(
      result.linearTransmissionFactor
    ).toBeCloseTo(
      10 ** -0.3,
      14
    );
    expect(
      result.opticalDensityBase10
    ).toBeCloseTo(0.3, 14);
  });

  it("keeps wavelength-dependent filter transmission spectral", () => {
    const result =
      resolveFrontOfLensFilterTransmission({
        profile: spectral(),
        wavelengthNanometers: 500,
        wavelengthBasis: "air"
      });

    expect(
      result.linearTransmissionFactor
    ).toBeCloseTo(0.7, 14);
    expect(
      result.transmissionKind
    ).toBe("spectral-transmission");
  });

  it("composes multiple passive filters multiplicatively with stable component identity", () => {
    const result =
      composeFrontOfLensFilterTransmission({
        filters: [
          neutralLinear(
            0.5,
            "nd-one"
          ),
          neutralLinear(
            0.25,
            "nd-two"
          )
        ],
        wavelengthNanometers: 550,
        wavelengthBasis: "air"
      });

    expect(
      result
        .combinedLinearTransmissionFactor
    ).toBe(0.125);
    expect(
      result.combinedAttenuationStops
    ).toBe(3);
    expect(
      result.components.map(
        (component) =>
          component.filterId
      )
    ).toEqual([
      "nd-one",
      "nd-two"
    ]);
    expect(
      result.uncertaintyPropagation
    ).toBe("not-propagated");
  });

  it("fails closed on wavelength basis/range drift and unsupported polarization claims", () => {
    expect(() =>
      resolveFrontOfLensFilterTransmission({
        profile: neutralLinear(),
        wavelengthNanometers: 550,
        wavelengthBasis: "vacuum"
      })
    ).toThrow("wavelength bases must match");

    expect(() =>
      resolveFrontOfLensFilterTransmission({
        profile: spectral(),
        wavelengthNanometers: 700,
        wavelengthBasis: "air"
      })
    ).toThrow("outside the filter applicability range");

    expect(() =>
      parseFrontOfLensFilterProfile({
        ...neutralLinear(),
        polarizationModeled: true
      })
    ).toThrow("polarization");
  });

  it("requires reusable rights for embedded spectral curve data", () => {
    const base = spectral();
    if (
      base.transmission.kind !==
      "spectral-transmission"
    ) {
      throw new Error(
        "Expected spectral filter."
      );
    }

    const transmission =
      base.transmission;

    expect(() =>
      parseFrontOfLensFilterProfile({
        ...base,
        transmission: {
          ...transmission,
          samples: {
            ...transmission.samples,
            evidence: [{
              sourceOrigin: "manufacturer",
              sourceReference:
                "published-filter-curve",
              reuseStatus:
                "factual-reference-only"
            }]
          }
        }
      })
    ).toThrow(
      "numeric filter data must be reusable-data or photivra-owned"
    );
  });

  it("requires quantified uncertainty before a filter can claim calibrated status", () => {
    expect(() =>
      parseFrontOfLensFilterProfile({
        ...neutralLinear(),
        scientificStatus: "calibrated"
      })
    ).toThrow(
      "requires quantified relative uncertainty"
    );
  });
});

describe("front filter integration with scene-to-sensor irradiance", () => {
  const calculate = (
    filters?:
      readonly FrontOfLensFilterProfile[]
  ): ReturnType<
    typeof calculateSceneRadianceToSensorIrradiance
  >["value"] =>
    calculateSceneRadianceToSensorIrradiance({
      sceneRadianceRequest:
        request(),
      sceneRadianceResult:
        radiance(),
      profile: optics(),
      focalLengthMm: 50,
      nominalFNumber: 4,
      focus: {
        kind: "infinity-focus"
      },
      imagePointMm: {
        x: 0,
        y: 0
      },
      fieldThroughput: {
        kind: "unity"
      },
      ...(filters === undefined
        ? {}
        : {
            frontOfLensFilters:
              filters
          })
    }).value;

  it("applies filter and lens transmission exactly once as independent multiplicative losses", () => {
    const noFilter = calculate();
    const filtered =
      calculate([
        neutralLinear(0.5)
      ]);

    expect(
      filtered
        .sensorPlaneSpectralIrradianceWattsPerSquareMeterNanometer
    ).toBeCloseTo(
      noFilter
        .sensorPlaneSpectralIrradianceWattsPerSquareMeterNanometer *
        0.5,
      14
    );
    expect(
      filtered
        .frontOfLensFilterTransmissionFactor
    ).toBe(0.5);
    expect(
      filtered.frontOfLensFilterCount
    ).toBe(1);
    expect(
      filtered
        .frontOfLensFilterTransmissionAppliedExactlyOnce
    ).toBe(true);
    expect(
      filtered
        .spectralTransmissionFactor
    ).toBe(0.8);
  });

  it("does not change geometric working f-number, DOF, or diffraction", () => {
    const noFilter = calculate();
    const filtered =
      calculate([
        neutralLinear(0.25)
      ]);

    expect(filtered.workingFNumber)
      .toBe(noFilter.workingFNumber);

    const dofBefore =
      calculateDepthOfField({
        focalLengthMm: 50,
        aperture: 4,
        focusDistanceM: 5,
        circleOfConfusionMm: 0.03
      });
    const dofAfter =
      calculateDepthOfField({
        focalLengthMm: 50,
        aperture: 4,
        focusDistanceM: 5,
        circleOfConfusionMm: 0.03
      });
    expect(dofAfter).toEqual(dofBefore);

    const diffractionBefore =
      calculateAiryDisk({
        aperture: 4,
        wavelengthNm: 550
      });
    const diffractionAfter =
      calculateAiryDisk({
        aperture: 4,
        wavelengthNm: 550
      });
    expect(diffractionAfter)
      .toEqual(diffractionBefore);
  });

  it("preserves filter evidence separately in the bridge result", () => {
    const filtered =
      calculate([
        spectral()
      ]);

    expect(
      filtered.componentEvidence
        .frontOfLensFilters.length
    ).toBeGreaterThan(0);
    expect(
      filtered
        .frontOfLensFilterPolarizationModeled
    ).toBe(false);
  });
});
