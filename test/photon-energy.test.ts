import { describe, expect, it } from "vitest";

import {
  calculatePhotonEnergyFromWavelength,
  parseSourcedAirPhaseRefractiveIndex,
  type SourcedAirPhaseRefractiveIndex
} from "../src/index.js";

const evidence = (ref: string) =>
  [{
    sourceOrigin: "photivra" as const,
    sourceReference: ref,
    reuseStatus: "photivra-owned" as const
  }] as const;

function airIndex(
  overrides:
    Partial<SourcedAirPhaseRefractiveIndex> = {}
): SourcedAirPhaseRefractiveIndex {
  return {
    wavelengthNanometers: 500,
    wavelengthBasis: "air",
    definition:
      "vacuum-wavelength-divided-by-air-wavelength",
    phaseRefractiveIndex:
      1.00027,
    scientificStatus:
      "calibrated",
    uncertainty: {
      kind: "relative",
      fraction: 1e-7,
      basis: "test"
    },
    evidence:
      evidence("air-index"),
    referenceConditions: {
      temperatureC: 20,
      pressurePascal: 101_325,
      relativeHumidityFraction:
        0.4,
      carbonDioxideMoleFraction:
        0.00042
    },
    ...overrides
  };
}

describe(
  "photon energy wavelength basis",
  () => {
    it("uses exact SI h and c for vacuum wavelength", () => {
      const result =
        calculatePhotonEnergyFromWavelength({
          wavelengthNanometers:
            500,
          wavelengthBasis:
            "vacuum"
        });

      expect(
        result.value
          .vacuumWavelengthNanometers
      ).toBe(500);
      expect(
        result.value.frequencyHertz
      ).toBeCloseTo(
        299_792_458 /
          (500e-9),
        5
      );
      expect(
        result.value.photonEnergyJoules
      ).toBeCloseTo(
        6.62607015e-34 *
          299_792_458 /
          (500e-9),
        28
      );
      expect(
        result.value.exactSiConstants
      ).toEqual({
        planckConstantJouleSeconds:
          6.62607015e-34,
        speedOfLightMetersPerSecond:
          299_792_458
      });
      expect(
        result.value
          .wavelengthConversion
      ).toBe(
        "vacuum-identity"
      );
      expect(
        result.provenance.kind
      ).toBe("calculated");
    });

    it("converts air wavelength to vacuum wavelength with the supplied phase index", () => {
      const result =
        calculatePhotonEnergyFromWavelength({
          wavelengthNanometers:
            500,
          wavelengthBasis: "air",
          airPhaseRefractiveIndex:
            airIndex()
        });

      expect(
        result.value
          .vacuumWavelengthNanometers
      ).toBeCloseTo(
        500 * 1.00027,
        12
      );
      expect(
        result.value.frequencyHertz
      ).toBeCloseTo(
        299_792_458 /
          (500e-9 * 1.00027),
        5
      );
      expect(
        result.value
          .phaseRefractiveIndexUsed
      ).toBe(1.00027);
      expect(
        result.value
          .airRefractiveIndexScientificStatus
      ).toBe("calibrated");
      expect(
        result.value
          .airRefractiveIndexUncertainty
      ).toEqual({
        kind: "relative",
        fraction: 1e-7,
        basis: "test"
      });
      expect(
        result.value
          .airRefractiveIndexReferenceConditions
      ).toEqual({
        temperatureC: 20,
        pressurePascal: 101_325,
        relativeHumidityFraction:
          0.4,
        carbonDioxideMoleFraction:
          0.00042
      });
      expect(
        result.value
          .airRefractiveIndexEvidence
      ).toEqual(
        evidence("air-index")
      );
      expect(
        result.value
          .inputUncertaintyPropagated
      ).toBe(false);
    });

    it("does not silently treat an air wavelength as vacuum", () => {
      expect(() =>
        calculatePhotonEnergyFromWavelength({
          wavelengthNanometers:
            500,
          wavelengthBasis: "air"
        })
      ).toThrow(
        "airPhaseRefractiveIndex is required"
      );
    });

    it("rejects unresolved wavelength basis", () => {
      expect(() =>
        calculatePhotonEnergyFromWavelength({
          wavelengthNanometers:
            500,
          wavelengthBasis:
            "unspecified"
        })
      ).toThrow(
        "must be resolved"
      );
    });

    it("rejects an air correction on a vacuum-basis wavelength", () => {
      expect(() =>
        calculatePhotonEnergyFromWavelength({
          wavelengthNanometers:
            500,
          wavelengthBasis:
            "vacuum",
          airPhaseRefractiveIndex:
            airIndex()
        })
      ).toThrow(
        "must be omitted"
      );
    });

    it("requires the refractive-index sample to match the exact air wavelength", () => {
      expect(() =>
        calculatePhotonEnergyFromWavelength({
          wavelengthNanometers:
            510,
          wavelengthBasis: "air",
          airPhaseRefractiveIndex:
            airIndex()
        })
      ).toThrow(
        "must exactly match"
      );
    });

    it("permits an explicitly approximate air index while preserving its limitation", () => {
      const result =
        calculatePhotonEnergyFromWavelength({
          wavelengthNanometers:
            500,
          wavelengthBasis: "air",
          airPhaseRefractiveIndex:
            airIndex({
              scientificStatus:
                "approximation",
              uncertainty: {
                kind:
                  "not-quantified",
                limitation:
                  "fixed test atmosphere"
              },
              referenceConditions:
                undefined
            } as never)
        });

      expect(
        result.value
          .airRefractiveIndexScientificStatus
      ).toBe("approximation");
      expect(
        result.value
          .airRefractiveIndexUncertainty
      ).toEqual({
        kind: "not-quantified",
        limitation:
          "fixed test atmosphere"
      });
      expect(
        result.value
          .airRefractiveIndexReferenceConditions
      ).toBeUndefined();
    });

    it("requires calibrated air index uncertainty and reference conditions", () => {
      expect(() =>
        parseSourcedAirPhaseRefractiveIndex({
          ...airIndex(),
          uncertainty: {
            kind:
              "not-quantified",
            limitation:
              "missing uncertainty"
          }
        })
      ).toThrow(
        "must declare quantified"
      );

      expect(() =>
        parseSourcedAirPhaseRefractiveIndex({
          ...airIndex(),
          referenceConditions:
            undefined
        })
      ).toThrow(
        "must declare temperature and pressure"
      );
    });

    it("validates the phase-index definition and atmospheric condition ranges", () => {
      expect(() =>
        parseSourcedAirPhaseRefractiveIndex({
          ...airIndex(),
          definition: "bad"
        })
      ).toThrow(
        "definition is invalid"
      );

      expect(() =>
        parseSourcedAirPhaseRefractiveIndex({
          ...airIndex(),
          phaseRefractiveIndex: 0
        })
      ).toThrow(
        "phaseRefractiveIndex must be greater than zero"
      );

      expect(() =>
        parseSourcedAirPhaseRefractiveIndex({
          ...airIndex(),
          referenceConditions: {
            temperatureC: 20,
            pressurePascal:
              101_325,
            relativeHumidityFraction:
              2
          }
        })
      ).toThrow(
        "relativeHumidityFraction"
      );
    });

    it("rejects non-positive wavelength inputs before physical conversion", () => {
      expect(() =>
        calculatePhotonEnergyFromWavelength({
          wavelengthNanometers: 0,
          wavelengthBasis:
            "vacuum"
        })
      ).toThrow(
        "wavelengthNanometers must be greater than zero"
      );
    });

    it("is deterministic for identical physical inputs", () => {
      const input = {
        wavelengthNanometers:
          500,
        wavelengthBasis:
          "air" as const,
        airPhaseRefractiveIndex:
          airIndex()
      };

      expect(
        calculatePhotonEnergyFromWavelength(
          input
        )
      ).toEqual(
        calculatePhotonEnergyFromWavelength(
          input
        )
      );
    });
  }
);
