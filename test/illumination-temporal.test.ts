import { describe, expect, it } from "vitest";

import {
  calculateCaptureExposureWindows,
  evaluateSceneIlluminationTemporalMultiplier,
  integrateSceneIlluminationTemporalMultiplierOverExposureWindow,
  parseSceneIlluminationProfile,
  parseSceneIlluminationTemporalProfile
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

const illuminationProfile = (
  enabled = true
): ReturnType<
  typeof parseSceneIlluminationProfile
> =>
  parseSceneIlluminationProfile({
    schemaVersion: "0.1.0",
    profileId: "lights",
    sceneId: "room",
    evidence: evidence("lights"),
    sources: [
      {
        sourceId: "flash",
        family: "point",
        enabled,
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
        evidence: evidence("flash")
      }
    ]
  });

const aperiodicWaveform = (): Record<string, unknown> => ({
  waveformId: "flash-waveform",
  kind: "aperiodic-relative-multiplier",
  timeUnit: "s",
  scientificStatus: "calibrated",
  uncertainty: {
    kind: "relative",
    fraction: 0.02,
    basis: "test waveform"
  },
  evidence: evidence("flash-waveform"),
  interpolation: "piecewise-linear",
  outsideSupportBehavior: "zero",
  samples: [
    {
      timeSecondsFromWaveformReference: 0,
      relativeMagnitudeMultiplier: 0
    },
    {
      timeSecondsFromWaveformReference: 0.005,
      relativeMagnitudeMultiplier: 2
    },
    {
      timeSecondsFromWaveformReference: 0.01,
      relativeMagnitudeMultiplier: 0
    }
  ]
});

const periodicWaveform = (): Record<string, unknown> => ({
  waveformId: "flicker-waveform",
  kind: "periodic-relative-multiplier",
  timeUnit: "s",
  scientificStatus: "approximation",
  uncertainty: {
    kind: "not-quantified",
    limitation: "test"
  },
  evidence: evidence("flicker-waveform"),
  interpolation: "piecewise-linear",
  periodSeconds: 0.01,
  endpointContinuityRequired: true,
  samples: [
    {
      timeSecondsFromWaveformReference: 0,
      relativeMagnitudeMultiplier: 0
    },
    {
      timeSecondsFromWaveformReference: 0.005,
      relativeMagnitudeMultiplier: 2
    },
    {
      timeSecondsFromWaveformReference: 0.01,
      relativeMagnitudeMultiplier: 0
    }
  ]
});

const temporalProfile = (
  waveform: Record<string, unknown> = aperiodicWaveform(),
  overrides: Record<string, unknown> = {}
): ReturnType<
  typeof parseSceneIlluminationTemporalProfile
> =>
  parseSceneIlluminationTemporalProfile({
    schemaVersion: "0.1.0",
    profileId: "temporal",
    sceneId: "room",
    illuminationProfileId: "lights",
    evidence: evidence("temporal"),
    waveforms: [waveform],
    sourceBindings: [
      {
        bindingId: "flash-binding",
        sourceId: "flash",
        waveformId: waveform.waveformId,
        captureTimeReference: "first-opening-boundary-phase",
        waveformTimeZeroSecondsFromCaptureReference: 0,
        scientificStatus: "calibrated",
        timingUncertainty: {
          kind: "absolute-seconds",
          plusMinusSeconds: 0.0001,
          basis: "test sync"
        },
        evidence: evidence("flash-binding")
      }
    ],
    ...overrides
  });

const exposureWindows = (): ReturnType<
  typeof calculateCaptureExposureWindows
>["value"] =>
  calculateCaptureExposureWindows({
    nativeRaster: {
      pixelWidth: 100,
      pixelHeight: 100
    },
    shutterMechanism: "electronic",
    nominalExposureDurationSeconds: {
      value: 0.01,
      unit: "s",
      evidence: evidence("exposure")
    },
    opening: {
      kind: "simultaneous"
    },
    closing: {
      kind: "simultaneous"
    },
    samplePointsNative: [
      {
        x: 50,
        y: 50
      }
    ]
  }).value;

describe("temporal illumination profiles", () => {
  it("parses an evidence-bound aperiodic waveform registration", () => {
    const profile =
      temporalProfile();

    expect(profile.profileId).toBe(
      "temporal"
    );
    expect(profile.waveforms).toHaveLength(
      1
    );
    expect(
      profile.sourceBindings[0]
        ?.captureTimeReference
    ).toBe(
      "first-opening-boundary-phase"
    );
    expect(
      profile.sensorReadoutTimingUsedAsExposureTiming
    ).toBe(false);
    expect(
      profile.automaticExposurePolicyIncluded
    ).toBe(false);
  });

  it("rejects malformed waveform timing, continuity, provenance, and calibration claims", () => {
    expect(() =>
      temporalProfile({
        ...aperiodicWaveform(),
        samples: [
          {
            timeSecondsFromWaveformReference: 0.001,
            relativeMagnitudeMultiplier: 0
          },
          {
            timeSecondsFromWaveformReference: 0.01,
            relativeMagnitudeMultiplier: 1
          }
        ]
      })
    ).toThrow(
      "must begin at waveform-local t=0"
    );

    expect(() =>
      temporalProfile({
        ...periodicWaveform(),
        samples: [
          {
            timeSecondsFromWaveformReference: 0,
            relativeMagnitudeMultiplier: 0
          },
          {
            timeSecondsFromWaveformReference: 0.01,
            relativeMagnitudeMultiplier: 1
          }
        ]
      })
    ).toThrow(
      "periodic endpoint multipliers must match"
    );

    expect(() =>
      temporalProfile({
        ...aperiodicWaveform(),
        uncertainty: {
          kind: "not-quantified",
          limitation: "missing"
        }
      })
    ).toThrow(
      "calibrated waveform data requires quantified relative uncertainty"
    );

    expect(() =>
      temporalProfile({
        ...aperiodicWaveform(),
        scientificStatus: "approximation",
        uncertainty: {
          kind: "not-quantified",
          limitation: "test"
        },
        evidence: [
          {
            sourceOrigin: "manufacturer",
            sourceReference: "public-page",
            reuseStatus: "factual-reference-only"
          }
        ]
      })
    ).toThrow(
      "must contain reusable-data or photivra-owned evidence"
    );
  });

  it("requires explicit valid waveform/source registration identity", () => {
    expect(() =>
      parseSceneIlluminationTemporalProfile({
        schemaVersion: "0.1.0",
        profileId: "temporal",
        sceneId: "room",
        illuminationProfileId: "lights",
        evidence: evidence("temporal"),
        waveforms: [
          aperiodicWaveform()
        ],
        sourceBindings: [
          {
            bindingId: "a",
            sourceId: "flash",
            waveformId: "missing",
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
      })
    ).toThrow(
      "references an unknown waveformId"
    );

    expect(() =>
      parseSceneIlluminationTemporalProfile({
        schemaVersion: "0.1.0",
        profileId: "temporal",
        sceneId: "room",
        illuminationProfileId: "lights",
        evidence: evidence("temporal"),
        waveforms: [
          aperiodicWaveform()
        ],
        sourceBindings: [
          {
            bindingId: "a",
            sourceId: "flash",
            waveformId: "flash-waveform",
            captureTimeReference: "first-opening-boundary-phase",
            waveformTimeZeroSecondsFromCaptureReference: 0,
            scientificStatus: "approximation",
            timingUncertainty: {
              kind: "not-quantified",
              limitation: "test"
            },
            evidence: evidence("a")
          },
          {
            bindingId: "b",
            sourceId: "flash",
            waveformId: "flash-waveform",
            captureTimeReference: "first-opening-boundary-phase",
            waveformTimeZeroSecondsFromCaptureReference: 0,
            scientificStatus: "approximation",
            timingUncertainty: {
              kind: "not-quantified",
              limitation: "test"
            },
            evidence: evidence("b")
          }
        ]
      })
    ).toThrow(
      "at most one temporal binding per sourceId"
    );
  });

  it("requires quantified timing uncertainty for calibrated registration", () => {
    expect(() =>
      temporalProfile(
        aperiodicWaveform(),
        {
          sourceBindings: [
            {
              bindingId: "flash-binding",
              sourceId: "flash",
              waveformId: "flash-waveform",
              captureTimeReference: "first-opening-boundary-phase",
              waveformTimeZeroSecondsFromCaptureReference: 0,
              scientificStatus: "calibrated",
              timingUncertainty: {
                kind: "not-quantified",
                limitation: "missing"
              },
              evidence: evidence("binding")
            }
          ]
        }
      )
    ).toThrow(
      "requires quantified absolute timing uncertainty"
    );
  });
});

describe("temporal illumination evaluation", () => {
  it("evaluates an aperiodic flash at registered capture time and zero outside support", () => {
    const illumination =
      illuminationProfile();
    const temporal =
      temporalProfile();

    const peak =
      evaluateSceneIlluminationTemporalMultiplier(
        {
          illuminationProfile:
            illumination,
          temporalProfile: temporal,
          sourceId: "flash",
          captureTimeSecondsFromReference:
            0.005
        }
      );
    expect(
      peak.relativeMagnitudeMultiplier
    ).toBe(2);
    expect(
      peak.effectiveRelativeMagnitudeMultiplier
    ).toBe(2);
    expect(
      peak.waveformTimeSecondsFromWaveformReference
    ).toBe(0.005);
    expect(
      peak.sensorReadoutTimingUsed
    ).toBe(false);
    expect(
      peak.automaticExposureResolved
    ).toBe(false);

    expect(
      evaluateSceneIlluminationTemporalMultiplier(
        {
          illuminationProfile:
            illumination,
          temporalProfile: temporal,
          sourceId: "flash",
          captureTimeSecondsFromReference:
            0.02
        }
      )
        .relativeMagnitudeMultiplier
    ).toBe(0);
  });

  it("supports explicit registration offset and periodic negative-time wrapping", () => {
    const illumination =
      illuminationProfile();
    const offsetTemporal =
      temporalProfile(
        aperiodicWaveform(),
        {
          sourceBindings: [
            {
              bindingId: "flash-binding",
              sourceId: "flash",
              waveformId: "flash-waveform",
              captureTimeReference: "first-opening-boundary-phase",
              waveformTimeZeroSecondsFromCaptureReference: 0.002,
              scientificStatus: "approximation",
              timingUncertainty: {
                kind: "not-quantified",
                limitation: "test"
              },
              evidence: evidence("binding")
            }
          ]
        }
      );

    expect(
      evaluateSceneIlluminationTemporalMultiplier(
        {
          illuminationProfile:
            illumination,
          temporalProfile:
            offsetTemporal,
          sourceId: "flash",
          captureTimeSecondsFromReference:
            0.002
        }
      )
        .waveformTimeSecondsFromWaveformReference
    ).toBe(0);

    const periodic =
      temporalProfile(
        periodicWaveform(),
        {
          sourceBindings: [
            {
              bindingId: "flash-binding",
              sourceId: "flash",
              waveformId: "flicker-waveform",
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
        }
      );

    expect(
      evaluateSceneIlluminationTemporalMultiplier(
        {
          illuminationProfile:
            illumination,
          temporalProfile: periodic,
          sourceId: "flash",
          captureTimeSecondsFromReference:
            -0.0025
        }
      )
        .relativeMagnitudeMultiplier
    ).toBeCloseTo(1, 12);
  });

  it("uses enabled state independently from waveform magnitude", () => {
    const evaluated =
      evaluateSceneIlluminationTemporalMultiplier(
        {
          illuminationProfile:
            illuminationProfile(false),
          temporalProfile:
            temporalProfile(),
          sourceId: "flash",
          captureTimeSecondsFromReference:
            0.005
        }
      );

    expect(
      evaluated.relativeMagnitudeMultiplier
    ).toBe(2);
    expect(
      evaluated.effectiveRelativeMagnitudeMultiplier
    ).toBe(0);
  });

  it("fails closed on missing registration, unknown source, or profile drift", () => {
    const illumination =
      illuminationProfile();

    expect(() =>
      evaluateSceneIlluminationTemporalMultiplier(
        {
          illuminationProfile:
            illumination,
          temporalProfile:
            parseSceneIlluminationTemporalProfile({
              schemaVersion: "0.1.0",
              profileId: "temporal",
              sceneId: "room",
              illuminationProfileId: "lights",
              evidence:
                evidence("temporal"),
              waveforms: [
                aperiodicWaveform()
              ],
              sourceBindings: []
            }),
          sourceId: "flash",
          captureTimeSecondsFromReference:
            0
        }
      )
    ).toThrow(
      "requires an explicit source waveform-to-capture registration"
    );

    expect(() =>
      evaluateSceneIlluminationTemporalMultiplier(
        {
          illuminationProfile:
            illumination,
          temporalProfile:
            temporalProfile(),
          sourceId: "missing",
          captureTimeSecondsFromReference:
            0
        }
      )
    ).toThrow(
      "sourceId is not declared"
    );

    const drift =
      temporalProfile(
        aperiodicWaveform(),
        {
          sceneId: "other"
        }
      );
    expect(() =>
      evaluateSceneIlluminationTemporalMultiplier(
        {
          illuminationProfile:
            illumination,
          temporalProfile: drift,
          sourceId: "flash",
          captureTimeSecondsFromReference:
            0
        }
      )
    ).toThrow(
      "sceneId must match"
    );
  });
});

describe("temporal illumination exposure integration", () => {
  it("integrates the waveform over the authoritative local exposure window", () => {
    const result =
      integrateSceneIlluminationTemporalMultiplierOverExposureWindow(
        {
          illuminationProfile:
            illuminationProfile(),
          temporalProfile:
            temporalProfile(),
          sourceId: "flash",
          exposureWindows:
            exposureWindows(),
          sampleIndex: 0,
          temporalSampleCount: 4
        }
      );

    expect(result.timeReference).toBe(
      "first-opening-boundary-phase"
    );
    expect(
      result.quadratureScheme
    ).toBe("uniform-midpoint");
    expect(result.nodes).toHaveLength(4);
    expect(
      result.averageRelativeMagnitudeMultiplier
    ).toBeCloseTo(1, 12);
    expect(
      result.integratedRelativeMagnitudeSeconds
    ).toBeCloseTo(0.01, 12);
    expect(
      result.sourceMagnitudeApplied
    ).toBe(false);
    expect(
      result.sceneRadianceCalculated
    ).toBe(false);
    expect(
      result.sensorReadoutTimingUsed
    ).toBe(false);
    expect(
      result.automaticExposureResolved
    ).toBe(false);
    expect(
      result.convergenceErrorEstimated
    ).toBe(false);
  });

  it("integrates disabled sources to zero effective contribution without changing the raw waveform", () => {
    const result =
      integrateSceneIlluminationTemporalMultiplierOverExposureWindow(
        {
          illuminationProfile:
            illuminationProfile(false),
          temporalProfile:
            temporalProfile(),
          sourceId: "flash",
          exposureWindows:
            exposureWindows(),
          sampleIndex: 0,
          temporalSampleCount: 2
        }
      );

    expect(
      result.averageRelativeMagnitudeMultiplier
    ).toBeCloseTo(1, 12);
    expect(
      result.averageEffectiveRelativeMagnitudeMultiplier
    ).toBe(0);
    expect(
      result.integratedEffectiveRelativeMagnitudeSeconds
    ).toBe(0);
  });

  it("rejects invalid exposure sample selection or temporal sample count", () => {
    expect(() =>
      integrateSceneIlluminationTemporalMultiplierOverExposureWindow(
        {
          illuminationProfile:
            illuminationProfile(),
          temporalProfile:
            temporalProfile(),
          sourceId: "flash",
          exposureWindows:
            exposureWindows(),
          sampleIndex: 2,
          temporalSampleCount: 2
        }
      )
    ).toThrow(
      "sampleIndex is outside"
    );

    expect(() =>
      integrateSceneIlluminationTemporalMultiplierOverExposureWindow(
        {
          illuminationProfile:
            illuminationProfile(),
          temporalProfile:
            temporalProfile(),
          sourceId: "flash",
          exposureWindows:
            exposureWindows(),
          sampleIndex: 0,
          temporalSampleCount: 0
        }
      )
    ).toThrow(
      "temporalSampleCount"
    );
  });
});
