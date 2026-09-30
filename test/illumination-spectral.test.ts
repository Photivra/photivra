import { describe, expect, it } from "vitest";

import {
  createSceneIlluminationSpectralCoverageParticipant,
  integrateDiscreteSpectralLineMeasure,
  parseSceneIlluminationProfile,
  resolveSceneIlluminationDiscreteLineMeasure
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

const discreteSource = (
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => ({
  sourceId: "line-source",
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
    kind: "radiant-intensity",
    wattsPerSteradian: 8,
    scientificStatus: "calibrated",
    uncertainty: {
      kind: "relative",
      fraction: 0.02,
      basis: "test magnitude"
    },
    evidence: evidence("magnitude")
  },
  spectrum: {
    kind: "discrete-relative-lines",
    spectrumId: "line-spectrum",
    wavelengthUnit: "nm",
    scientificStatus:
      "calibrated-relative-lines",
    uncertainty: {
      kind: "relative",
      fraction: 0.03,
      basis: "test line spectrum"
    },
    evidence: evidence("lines"),
    distribution: {
      wavelengthBasis: "vacuum",
      lineModel:
        "delta-like-integrated",
      normalization:
        "sum-normalized-integrated-weight-to-one",
      lines: [
        {
          lineId: "blue",
          wavelengthNanometers: 450,
          normalizedIntegratedWeight:
            0.25
        },
        {
          lineId: "red",
          wavelengthNanometers: 650,
          normalizedIntegratedWeight:
            0.75
        }
      ]
    }
  },
  temporalBehavior: {
    kind: "time-invariant"
  },
  evidence: evidence("source"),
  ...overrides
});

const continuousSource =
  (): Record<string, unknown> => ({
    sourceId: "continuous",
    family: "environment",
    enabled: true,
    geometry: {
      kind: "environment"
    },
    magnitude: {
      kind: "relative-linear-scale",
      scale: 1,
      scientificStatus:
        "approximation",
      limitation: "test"
    },
    spectrum: {
      kind:
        "continuous-relative-spectrum",
      spectrumId: "continuous-spd",
      wavelengthUnit: "nm",
      wavelengthBasis: "vacuum",
      interpolation:
        "piecewise-linear",
      outsideRangeBehavior:
        "fail-closed",
      normalization:
        "arbitrary-relative-scale",
      scientificStatus:
        "approximation",
      uncertainty: {
        kind: "not-quantified",
        limitation: "test"
      },
      evidence: evidence("continuous"),
      samples: [
        {
          wavelengthNanometers: 400,
          relativeDensityPerNanometer:
            0.2
        },
        {
          wavelengthNanometers: 500,
          relativeDensityPerNanometer:
            1
        },
        {
          wavelengthNanometers: 700,
          relativeDensityPerNanometer:
            0.1
        }
      ]
    },
    temporalBehavior: {
      kind: "time-invariant"
    },
    evidence: evidence("source")
  });

const profile = (
  source: Record<string, unknown>
): ReturnType<
  typeof parseSceneIlluminationProfile
> =>
  parseSceneIlluminationProfile({
    schemaVersion: "0.1.0",
    profileId: "lights",
    sceneId: "room",
    evidence: evidence("profile"),
    sources: [source]
  });

describe("illumination discrete line spectra", () => {
  it("parses calibrated relative line positions/weights without turning them into continuous density", () => {
    const parsed =
      profile(discreteSource());
    const spectrum =
      parsed.sources[0]!.spectrum;

    expect(spectrum.kind).toBe(
      "discrete-relative-lines"
    );
    if (
      spectrum.kind !==
      "discrete-relative-lines"
    ) {
      throw new Error(
        "Expected discrete line spectrum."
      );
    }

    expect(
      spectrum.distribution.lines
    ).toHaveLength(2);
    expect(
      spectrum.distribution
        .wavelengthBasis
    ).toBe("vacuum");
    expect(
      spectrum.scientificStatus
    ).toBe(
      "calibrated-relative-lines"
    );
  });

  it("resolves physical source magnitude into integrated line quantities without d-lambda", () => {
    const source =
      profile(discreteSource())
        .sources[0]!;
    const resolved =
      resolveSceneIlluminationDiscreteLineMeasure(
        source
      );

    expect(
      resolved.measure.quantityUnit
    ).toBe("W/sr");
    expect(
      resolved.measure.lines.map(
        (line) =>
          line.integratedQuantity
      )
    ).toEqual([2, 6]);
    expect(
      resolved
        .calibratedAbsoluteLineClaimAuthorized
    ).toBe(false);
    expect(
      resolved.materialTransportApplied
    ).toBe(false);
    expect(
      resolved.sceneRadianceCalculated
    ).toBe(false);

    const integrated =
      integrateDiscreteSpectralLineMeasure(
        resolved.measure
      );
    expect(
      integrated.integratedQuantity
    ).toBe(8);
    expect(
      integrated
        .wavelengthMeasureMultiplicationApplied
    ).toBe(false);
  });

  it("respects the explicit source enabled state instead of using zero magnitude as an off switch", () => {
    const source =
      profile(
        discreteSource({
          enabled: false
        })
      ).sources[0]!;
    const resolved =
      resolveSceneIlluminationDiscreteLineMeasure(
        source
      );

    expect(
      resolved.sourceEnabled
    ).toBe(false);
    expect(
      resolved.measure.lines.every(
        (line) =>
          line.integratedQuantity === 0
      )
    ).toBe(true);
  });

  it("keeps relative magnitude relative for spot/environment-style source paths", () => {
    const source =
      profile(
        discreteSource({
          family: "environment",
          geometry: {
            kind: "environment"
          },
          magnitude: {
            kind:
              "relative-linear-scale",
            scale: 2,
            scientificStatus:
              "approximation",
            limitation:
              "relative-only source"
          }
        })
      ).sources[0]!;
    const resolved =
      resolveSceneIlluminationDiscreteLineMeasure(
        source
      );

    expect(
      resolved.measure.quantityUnit
    ).toBe("relative");
    expect(
      resolved.measure.lines.map(
        (line) =>
          line.integratedQuantity
      )
    ).toEqual([0.5, 1.5]);
    expect(
      resolved
        .magnitudeScientificStatus
    ).toBe("approximation");
  });

  it("rejects malformed calibrated line spectra and non-reusable embedded data", () => {
    const badUncertainty =
      discreteSource();
    badUncertainty.spectrum = {
      ...(badUncertainty.spectrum as Record<
        string,
        unknown
      >),
      uncertainty: {
        kind: "not-quantified",
        limitation: "missing"
      }
    };
    expect(() =>
      profile(badUncertainty)
    ).toThrow(
      "require quantified relative uncertainty"
    );

    const badRights =
      discreteSource();
    badRights.spectrum = {
      ...(badRights.spectrum as Record<
        string,
        unknown
      >),
      scientificStatus:
        "approximation",
      uncertainty: {
        kind: "not-quantified",
        limitation: "test"
      },
      evidence: [
        {
          sourceOrigin:
            "manufacturer",
          sourceReference:
            "public-page",
          reuseStatus:
            "factual-reference-only"
        }
      ]
    };
    expect(() =>
      profile(badRights)
    ).toThrow(
      "must contain reusable-data or photivra-owned evidence"
    );
  });

  it("rejects non-normalized or unresolved-basis line distributions", () => {
    const badWeights =
      discreteSource();
    const badWeightSpectrum =
      badWeights.spectrum as Record<
        string,
        unknown
      >;
    badWeights.spectrum = {
      ...badWeightSpectrum,
      distribution: {
        ...(badWeightSpectrum.distribution as Record<
          string,
          unknown
        >),
        lines: [
          {
            lineId: "blue",
            wavelengthNanometers:
              450,
            normalizedIntegratedWeight:
              0.4
          },
          {
            lineId: "red",
            wavelengthNanometers:
              650,
            normalizedIntegratedWeight:
              0.4
          }
        ]
      }
    };
    expect(() =>
      profile(badWeights)
    ).toThrow("must sum to 1");

    const badBasis =
      discreteSource();
    const badBasisSpectrum =
      badBasis.spectrum as Record<
        string,
        unknown
      >;
    badBasis.spectrum = {
      ...badBasisSpectrum,
      distribution: {
        ...(badBasisSpectrum.distribution as Record<
          string,
          unknown
        >),
        wavelengthBasis:
          "unspecified"
      }
    };
    expect(() =>
      profile(badBasis)
    ).toThrow(
      "must be air or vacuum"
    );
  });
});

describe("illumination continuous coverage adapter", () => {
  it("exposes finite continuous support and internal source knots", () => {
    const source =
      profile(continuousSource())
        .sources[0]!;
    const participant =
      createSceneIlluminationSpectralCoverageParticipant(
        { source }
      );

    expect(participant).toEqual({
      participantId:
        "illumination-source:continuous:continuous-spd",
      role: "illumination-source",
      wavelengthBasis: "vacuum",
      wavelengthRangeNanometers: {
        minimum: 400,
        maximum: 700
      },
      breakpointsNanometers: [
        500
      ]
    });
  });

  it("does not broaden discrete lines into continuous coverage", () => {
    const source =
      profile(discreteSource())
        .sources[0]!;

    expect(() =>
      createSceneIlluminationSpectralCoverageParticipant(
        { source }
      )
    ).toThrow(
      "discrete lines"
    );
  });
  it("covers continuous adapter basis/id guards and discrete resolver type guard", () => {
    const unresolvedBasis =
      continuousSource();
    const spectrum =
      unresolvedBasis.spectrum as Record<
        string,
        unknown
      >;
    unresolvedBasis.spectrum = {
      ...spectrum,
      wavelengthBasis: "unspecified"
    };
    const unresolvedSource =
      profile(unresolvedBasis)
        .sources[0]!;

    expect(() =>
      createSceneIlluminationSpectralCoverageParticipant(
        { source: unresolvedSource }
      )
    ).toThrow(
      "requires a resolved air or vacuum wavelength basis"
    );

    const continuous =
      profile(continuousSource())
        .sources[0]!;
    expect(() =>
      createSceneIlluminationSpectralCoverageParticipant(
        {
          source: continuous,
          participantId: " "
        }
      )
    ).toThrow(
      "participantId must be a non-empty string"
    );

    expect(() =>
      resolveSceneIlluminationDiscreteLineMeasure(
        continuous
      )
    ).toThrow(
      "requires a discrete-relative-lines spectrum"
    );
  });

  it("preserves area-radiance and directional-irradiance line quantity domains", () => {
    const area =
      profile(
        discreteSource({
          family: "area",
          geometry: {
            kind: "scene-object-binding",
            sceneObjectId: "panel"
          },
          magnitude: {
            kind: "surface-radiance",
            wattsPerSquareMeterSteradian:
              4,
            scientificStatus:
              "approximation",
            uncertainty: {
              kind: "not-quantified",
              limitation: "test"
            },
            evidence:
              evidence("area")
          }
        })
      ).sources[0]!;
    const areaMeasure =
      resolveSceneIlluminationDiscreteLineMeasure(
        area
      );
    expect(
      areaMeasure.measure.quantityUnit
    ).toBe("W/m^2/sr");
    expect(
      integrateDiscreteSpectralLineMeasure(
        areaMeasure.measure
      ).integratedQuantity
    ).toBe(4);

    const directional =
      profile(
        discreteSource({
          family: "directional",
          geometry: {
            kind: "directional",
            directionUnitVector: {
              x: 0,
              y: -1,
              z: 0
            }
          },
          magnitude: {
            kind:
              "reference-plane-irradiance",
            wattsPerSquareMeter: 3,
            referencePlaneId:
              "ground",
            scientificStatus:
              "approximation",
            uncertainty: {
              kind: "not-quantified",
              limitation: "test"
            },
            evidence:
              evidence("directional")
          }
        })
      ).sources[0]!;
    const directionalMeasure =
      resolveSceneIlluminationDiscreteLineMeasure(
        directional
      );
    expect(
      directionalMeasure.measure
        .quantityUnit
    ).toBe("W/m^2");
    expect(
      integrateDiscreteSpectralLineMeasure(
        directionalMeasure.measure
      ).integratedQuantity
    ).toBe(3);
  });

});
