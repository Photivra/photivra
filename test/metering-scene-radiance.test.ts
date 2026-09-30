import { describe, expect, it } from "vitest";

import {
  createSceneRadianceDerivedExposureMeteringSampleSet,
  meterRelativeExposure,
  meterSceneRadianceTemporalExposure,
  parseExposureMeteringProfile,
  parseSceneIlluminationProfile,
  parseSceneIlluminationTemporalProfile,
  parseSceneMaterialResponseProfile,
  parseSceneRadianceMeteringDerivationProfile,
  parseSceneRadianceProviderProfile,
  resolveCaptureGeometry,
  type ExposureMeteringZoneSample
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

const captureGeometry = (): ReturnType<
  typeof resolveCaptureGeometry
>["value"] =>
  resolveCaptureGeometry({
    imagingArea: {
      widthMm: 36,
      heightMm: 24
    },
    nativeRaster: {
      pixelWidth: 6000,
      pixelHeight: 4000
    },
    orientation: "landscape"
  }).value;

const illuminationProfile = (): ReturnType<
  typeof parseSceneIlluminationProfile
> =>
  parseSceneIlluminationProfile({
    schemaVersion: "0.1.0",
    profileId: "lights",
    sceneId: "scene",
    evidence: evidence("lights"),
    sources: [
      {
        sourceId: "key",
        family: "point",
        enabled: true,
        geometry: {
          kind: "point-position",
          positionM: {
            x: 0,
            y: 1,
            z: 2
          }
        },
        magnitude: {
          kind: "relative-linear-scale",
          scale: 1,
          scientificStatus: "approximation",
          limitation: "test"
        },
        spectrum: {
          kind: "unresolved",
          limitation: "test"
        },
        temporalBehavior: {
          kind: "time-invariant"
        },
        evidence: evidence("key")
      }
    ]
  });

const temporalProfile = (): ReturnType<
  typeof parseSceneIlluminationTemporalProfile
> =>
  parseSceneIlluminationTemporalProfile({
    schemaVersion: "0.1.0",
    profileId: "temporal-lights",
    sceneId: "scene",
    illuminationProfileId: "lights",
    evidence: evidence("temporal"),
    waveforms: [
      {
        waveformId: "flicker",
        kind: "periodic-relative-multiplier",
        timeUnit: "s",
        scientificStatus: "approximation",
        uncertainty: {
          kind: "not-quantified",
          limitation: "test"
        },
        evidence: evidence("flicker"),
        interpolation: "piecewise-linear",
        periodSeconds: 0.02,
        endpointContinuityRequired: true,
        samples: [
          {
            timeSecondsFromWaveformReference: 0,
            relativeMagnitudeMultiplier: 1
          },
          {
            timeSecondsFromWaveformReference: 0.01,
            relativeMagnitudeMultiplier: 0.5
          },
          {
            timeSecondsFromWaveformReference: 0.02,
            relativeMagnitudeMultiplier: 1
          }
        ]
      }
    ],
    sourceBindings: [
      {
        bindingId: "key-flicker",
        sourceId: "key",
        waveformId: "flicker",
        captureTimeReference: "first-opening-boundary-phase",
        waveformTimeZeroSecondsFromCaptureReference: 0,
        scientificStatus: "approximation",
        timingUncertainty: {
          kind: "not-quantified",
          limitation: "test"
        },
        evidence: evidence("binding")
      }
    ]
  });

const materialProfile = (): ReturnType<
  typeof parseSceneMaterialResponseProfile
> =>
  parseSceneMaterialResponseProfile({
    schemaVersion: "0.1.0",
    profileId: "materials",
    sceneId: "scene",
    evidence: evidence("materials"),
    materials: [
      {
        materialResponseId: "wall",
        evidence: evidence("wall"),
        representation: {
          kind: "rgb-pbr-approximation",
          colorSpace: "linear-srgb",
          baseColor: {
            red: 0.5,
            green: 0.5,
            blue: 0.5
          },
          metallic: 0,
          roughness: 0.5,
          limitation: "test"
        }
      }
    ],
    fluorescenceModeled: false,
    volumetricMaterialTransportModeled: false,
    polarizationModeled: false
  });

const providerProfile = (
  temporal = false
): ReturnType<
  typeof parseSceneRadianceProviderProfile
> =>
  parseSceneRadianceProviderProfile({
    schemaVersion: "0.1.0",
    profileId: "provider",
    sceneId: "scene",
    illuminationProfileId: "lights",
    ...(temporal
      ? {
          illuminationTemporalProfileId:
            "temporal-lights"
        }
      : {}),
    materialResponseProfileId: "materials",
    outputQuantity: "outgoing-spectral-radiance",
    outputUnit: "W/m^2/sr/nm",
    scientificStatus: "approximation",
    uncertainty: {
      kind: "not-quantified",
      limitation: "test"
    },
    fidelity: {
      spectral: "rgb-derived-approximation",
      material: "rgb-pbr-approximation",
      visibility: "resolved",
      directTransport: "approximation",
      indirectTransport: "not-modeled"
    },
    wavelengthChangingTransportModeled: false,
    volumetricTransportModeled: false,
    polarizationModeled: false,
    evidence: evidence("provider"),
    limitations: [
      "Relative preview/provider path."
    ]
  });

const derivationProfile = (): ReturnType<
  typeof parseSceneRadianceMeteringDerivationProfile
> =>
  parseSceneRadianceMeteringDerivationProfile({
    schemaVersion: "0.1.0",
    derivationId: "relative-meter-reduction",
    scientificStatus: "approximation",
    method:
      "renderer-provided-pre-exposure-relative-reduction",
    spectralWeighting: "not-calibrated",
    evidence: evidence("derivation"),
    limitation:
      "Scalar reduction is relative and not a calibrated spectral meter."
  });

const samples = (
  signal: number
): readonly ExposureMeteringZoneSample[] => [
  {
    sampleId: "left",
    positionOrientedCaptureUv: {
      u: 0.25,
      v: 0.5
    },
    relativeLinearSignal: signal,
    areaWeight: 1
  },
  {
    sampleId: "right",
    positionOrientedCaptureUv: {
      u: 0.75,
      v: 0.5
    },
    relativeLinearSignal: signal,
    areaWeight: 1
  }
];

const meterProfile = (): ReturnType<
  typeof parseExposureMeteringProfile
> =>
  parseExposureMeteringProfile({
    schemaVersion: "0.1.0",
    profileId: "meter",
    scientificStatus: "approximation",
    inputDomain:
      "relative-pre-exposure-linear-signal",
    captureRegion:
      "oriented-active-capture",
    policy: {
      kind: "multi-zone-uniform"
    },
    target: {
      kind: "relative-signal-reference",
      targetRelativeSignal: 1,
      evidence: evidence("target")
    },
    evidence: evidence("meter"),
    limitations: [
      "Relative educational meter."
    ]
  });

describe("scene-radiance metering derivation", () => {
  it("keeps the spectral-to-scalar bridge explicitly approximate and uncalibrated", () => {
    const derivation =
      derivationProfile();

    expect(derivation).toMatchObject({
      scientificStatus: "approximation",
      method:
        "renderer-provided-pre-exposure-relative-reduction",
      spectralWeighting: "not-calibrated"
    });
  });

  it("rejects calibrated or implicit spectral weighting claims", () => {
    expect(() =>
      parseSceneRadianceMeteringDerivationProfile({
        ...derivationProfile(),
        scientificStatus: "calibrated"
      })
    ).toThrow(
      'scientificStatus must be "approximation"'
    );

    expect(() =>
      parseSceneRadianceMeteringDerivationProfile({
        ...derivationProfile(),
        spectralWeighting: "photopic-v-lambda"
      })
    ).toThrow(
      'spectralWeighting must be "not-calibrated"'
    );
  });
});

describe("scene-radiance-derived meter sample sets", () => {
  it("binds a static provider context without promoting calibrated claims", () => {
    const sampleSet =
      createSceneRadianceDerivedExposureMeteringSampleSet({
        measurementId: "m-static",
        sceneStateId: "state-1",
        providerProfile:
          providerProfile(false),
        illuminationProfile:
          illuminationProfile(),
        materialResponseProfile:
          materialProfile(),
        captureGeometry:
          captureGeometry(),
        derivationProfile:
          derivationProfile(),
        samples: samples(1)
      });

    expect(
      sampleSet.sourceContext
    ).toMatchObject({
      kind:
        "scene-radiance-provider-derived-relative",
      sceneId: "scene",
      sceneStateId: "state-1",
      providerProfileId: "provider",
      illuminationProfileId: "lights",
      materialResponseProfileId:
        "materials",
      derivationProfileId:
        "relative-meter-reduction",
      materialResponseFidelity:
        "rgb-pbr-approximation",
      temporal: {
        kind: "time-invariant"
      },
      spectralReductionCalibrated:
        false,
      calibratedLuminanceClaimAuthorized:
        false,
      calibratedSceneRadianceClaimAuthorized:
        false
    });

    const metered =
      meterRelativeExposure({
        profile: meterProfile(),
        sampleSet
      }).value;
    expect(
      metered.meteredRelativeSignal
    ).toBeCloseTo(1, 12);
  });

  it("requires an explicit capture time for a provider bound to temporal illumination", () => {
    expect(() =>
      createSceneRadianceDerivedExposureMeteringSampleSet({
        measurementId: "m-temporal",
        sceneStateId: "state-1",
        providerProfile:
          providerProfile(true),
        illuminationProfile:
          illuminationProfile(),
        materialResponseProfile:
          materialProfile(),
        illuminationTemporalProfile:
          temporalProfile(),
        captureGeometry:
          captureGeometry(),
        derivationProfile:
          derivationProfile(),
        samples: samples(1)
      })
    ).toThrow(
      "requires an explicit captureTimeSecondsFromReference"
    );

    const sampleSet =
      createSceneRadianceDerivedExposureMeteringSampleSet({
        measurementId: "m-temporal",
        sceneStateId: "state-1",
        providerProfile:
          providerProfile(true),
        illuminationProfile:
          illuminationProfile(),
        materialResponseProfile:
          materialProfile(),
        illuminationTemporalProfile:
          temporalProfile(),
        captureTimeSecondsFromReference:
          0.01,
        captureGeometry:
          captureGeometry(),
        derivationProfile:
          derivationProfile(),
        samples: samples(0.5)
      });

    expect(
      sampleSet.sourceContext.temporal
    ).toEqual({
      kind:
        "registered-time-varying",
      illuminationTemporalProfileId:
        "temporal-lights",
      timeReference:
        "first-opening-boundary-phase",
      captureTimeSecondsFromReference:
        0.01
    });
  });

  it("rejects hidden temporal input on a static provider", () => {
    expect(() =>
      createSceneRadianceDerivedExposureMeteringSampleSet({
        measurementId: "m-static",
        sceneStateId: "state-1",
        providerProfile:
          providerProfile(false),
        illuminationProfile:
          illuminationProfile(),
        materialResponseProfile:
          materialProfile(),
        illuminationTemporalProfile:
          temporalProfile(),
        captureGeometry:
          captureGeometry(),
        derivationProfile:
          derivationProfile(),
        samples: samples(1)
      })
    ).toThrow(
      "provider profile does not bind one"
    );
  });

  it("rejects provider/material/scene identity drift", () => {
    const badMaterials = {
      ...materialProfile(),
      sceneId: "other-scene"
    };

    expect(() =>
      createSceneRadianceDerivedExposureMeteringSampleSet({
        measurementId: "m",
        sceneStateId: "state",
        providerProfile:
          providerProfile(false),
        illuminationProfile:
          illuminationProfile(),
        materialResponseProfile:
          badMaterials,
        captureGeometry:
          captureGeometry(),
        derivationProfile:
          derivationProfile(),
        samples: samples(1)
      })
    ).toThrow(
      "must reference the same sceneId"
    );

    const wrongFidelity = {
      ...providerProfile(false),
      fidelity: {
        ...providerProfile(false).fidelity,
        material: "spectral-data" as const
      }
    };

    expect(() =>
      createSceneRadianceDerivedExposureMeteringSampleSet({
        measurementId: "m",
        sceneStateId: "state",
        providerProfile:
          wrongFidelity,
        illuminationProfile:
          illuminationProfile(),
        materialResponseProfile:
          materialProfile(),
        captureGeometry:
          captureGeometry(),
        derivationProfile:
          derivationProfile(),
        samples: samples(1)
      })
    ).toThrow(
      "Provider material fidelity must match"
    );
  });
});

describe("explicit temporal relative metering", () => {
  const atTime = (
    captureTimeSecondsFromReference:
      number,
    signal: number,
    measurementId: string,
    sceneStateId = "state-live"
  ): ReturnType<
    typeof createSceneRadianceDerivedExposureMeteringSampleSet
  > =>
    createSceneRadianceDerivedExposureMeteringSampleSet({
      measurementId,
      sceneStateId,
      providerProfile:
        providerProfile(true),
      illuminationProfile:
        illuminationProfile(),
      materialResponseProfile:
        materialProfile(),
      illuminationTemporalProfile:
        temporalProfile(),
      captureTimeSecondsFromReference,
      captureGeometry:
        captureGeometry(),
      derivationProfile:
        derivationProfile(),
      samples: samples(signal)
    });

  it("averages the declared pre-exposure signal in time rather than averaging stop offsets", () => {
    const result =
      meterSceneRadianceTemporalExposure({
        temporalMeasurementId:
          "temporal-meter-1",
        profile: meterProfile(),
        policy: {
          kind:
            "weighted-time-average",
          timeReference:
            "first-opening-boundary-phase"
        },
        temporalSamples: [
          {
            normalizedTimeWeight:
              0.5,
            sampleSet:
              atTime(
                0,
                1,
                "m0"
              )
          },
          {
            normalizedTimeWeight:
              0.5,
            sampleSet:
              atTime(
                0.01,
                0.5,
                "m1"
              )
          }
        ]
      }).value;

    expect(
      result.meteredRelativeSignal
    ).toBeCloseTo(0.75, 12);
    expect(result.status).toBe(
      "resolved"
    );
    if (
      result.status !==
      "resolved"
    ) {
      throw new Error(
        "Expected resolved temporal meter."
      );
    }
    expect(
      result.exposureOffsetStopsToTarget
    ).toBeCloseTo(
      Math.log2(1 / 0.75),
      12
    );
    expect(
      result.temporalAveragingExplicit
    ).toBe(true);
    expect(
      result.flashTtlMeteringPerformed
    ).toBe(false);
  });

  it("preserves the uniform -1 stop invariant under explicit temporal averaging", () => {
    const result =
      meterSceneRadianceTemporalExposure({
        temporalMeasurementId:
          "temporal-minus-one",
        profile: meterProfile(),
        policy: {
          kind:
            "weighted-time-average",
          timeReference:
            "first-opening-boundary-phase"
        },
        temporalSamples: [
          {
            normalizedTimeWeight:
              0.25,
            sampleSet:
              atTime(
                0,
                0.5,
                "m0"
              )
          },
          {
            normalizedTimeWeight:
              0.75,
            sampleSet:
              atTime(
                0.01,
                0.5,
                "m1"
              )
          }
        ]
      }).value;

    expect(result.status).toBe(
      "resolved"
    );
    if (
      result.status !==
      "resolved"
    ) {
      throw new Error(
        "Expected resolved temporal meter."
      );
    }
    expect(
      result.exposureOffsetStopsToTarget
    ).toBeCloseTo(1, 12);
  });

  it("keeps all-zero temporal measurements finite", () => {
    const result =
      meterSceneRadianceTemporalExposure({
        temporalMeasurementId:
          "temporal-dark",
        profile: meterProfile(),
        policy: {
          kind:
            "weighted-time-average",
          timeReference:
            "first-opening-boundary-phase"
        },
        temporalSamples: [
          {
            normalizedTimeWeight:
              0.5,
            sampleSet:
              atTime(
                0,
                0,
                "m0"
              )
          },
          {
            normalizedTimeWeight:
              0.5,
            sampleSet:
              atTime(
                0.01,
                0,
                "m1"
              )
          }
        ]
      }).value;

    expect(result.status).toBe(
      "no-signal"
    );
    expect(
      result.meteredRelativeSignal
    ).toBe(0);
  });

  it("fails closed on implicit or invalid temporal averaging policy", () => {
    expect(() =>
      meterSceneRadianceTemporalExposure({
        temporalMeasurementId:
          "bad-weight",
        profile: meterProfile(),
        policy: {
          kind:
            "weighted-time-average",
          timeReference:
            "first-opening-boundary-phase"
        },
        temporalSamples: [
          {
            normalizedTimeWeight:
              0.2,
            sampleSet:
              atTime(
                0,
                1,
                "m0"
              )
          },
          {
            normalizedTimeWeight:
              0.2,
            sampleSet:
              atTime(
                0.01,
                1,
                "m1"
              )
          }
        ]
      })
    ).toThrow(
      "normalizedTimeWeight values must sum to 1"
    );

    expect(() =>
      meterSceneRadianceTemporalExposure({
        temporalMeasurementId:
          "bad-time",
        profile: meterProfile(),
        policy: {
          kind:
            "weighted-time-average",
          timeReference:
            "first-opening-boundary-phase"
        },
        temporalSamples: [
          {
            normalizedTimeWeight:
              0.5,
            sampleSet:
              atTime(
                0.01,
                1,
                "m1"
              )
          },
          {
            normalizedTimeWeight:
              0.5,
            sampleSet:
              atTime(
                0.005,
                1,
                "m0"
              )
          }
        ]
      })
    ).toThrow(
      "capture times must be strictly increasing"
    );
  });

  it("rejects stale/mixed scene-state contexts in one temporal average", () => {
    expect(() =>
      meterSceneRadianceTemporalExposure({
        temporalMeasurementId:
          "mixed-state",
        profile: meterProfile(),
        policy: {
          kind:
            "weighted-time-average",
          timeReference:
            "first-opening-boundary-phase"
        },
        temporalSamples: [
          {
            normalizedTimeWeight:
              0.5,
            sampleSet:
              atTime(
                0,
                1,
                "m0",
                "state-a"
              )
          },
          {
            normalizedTimeWeight:
              0.5,
            sampleSet:
              atTime(
                0.01,
                1,
                "m1",
                "state-b"
              )
          }
        ]
      })
    ).toThrow(
      "must bind the same sceneStateId"
    );
  });
});
