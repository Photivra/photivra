import { describe, expect, it } from "vitest";

import {
  composeScientificAssurance,
  type ScientificAssuranceComponent
} from "../src/index.js";
import { loadBasicReferenceFixture } from "./helpers/basic-reference-fixture.js";

const fixture = loadBasicReferenceFixture();

const photivraEvidence = (
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

const component = (
  overrides: Partial<
    ScientificAssuranceComponent
  > = {}
): ScientificAssuranceComponent => ({
  componentId: "component-a",
  role: "test component",
  required: true,
  sourceIdentity: {
    kind: "model",
    id: "model-a",
    version: "1.0.0"
  },
  basisKind:
    "evidence-backed-fact",
  scientificStatus: "calibrated",
  evidenceRequirement: "required",
  evidence:
    photivraEvidence("component-a"),
  uncertainty: {
    kind: "relative",
    fraction: 0.02,
    basis: "test calibration"
  },
  limitations: [],
  ...overrides
});

describe("scientific assurance composition", () => {
  it("bounds downstream status by the weakest required input", () => {
    const result =
      composeScientificAssurance({
        components: [
          component(),
          component({
            componentId:
              "approximate-input",
            sourceIdentity: {
              kind: "profile",
              id: "approx-profile",
              version: "2.0.0"
            },
            basisKind:
              "photivra-model-assumption",
            scientificStatus:
              "approximation",
            uncertainty: {
              kind:
                "not-quantified",
              limitation:
                "No defensible numeric model-error bound."
            }
          }),
          component({
            componentId:
              "optional-unknown",
            required: false,
            scientificStatus:
              "unknown",
            uncertainty: {
              kind: "unknown",
              limitation:
                "Optional diagnostic has no uncertainty information."
            }
          })
        ]
      });

    expect(result.scientificStatus)
      .toBe("approximation");
    expect(
      result
        .weakestRequiredComponentIds
    ).toEqual([
      "approximate-input"
    ]);
    expect(
      result.downstreamStatusPromotedAboveInputs
    ).toBe(false);
  });

  it("keeps not-quantified distinct from zero uncertainty", () => {
    const result =
      composeScientificAssurance({
        components: [
          component({
            uncertainty: {
              kind:
                "not-quantified",
              limitation:
                "Approximation error is known to exist but is not bounded."
            }
          })
        ]
      });

    expect(result.uncertainty)
      .toMatchObject({
        kind: "not-quantified",
        componentIds: [
          "component-a"
        ]
      });
    expect(
      result.aggregateNumericUncertaintyFabricated
    ).toBe(false);
  });

  it("preserves quantified components but reports numeric composition as not propagated", () => {
    const result =
      composeScientificAssurance({
        components: [
          component({
            componentId: "measured"
          }),
          component({
            componentId: "calibration",
            sourceIdentity: {
              kind: "profile",
              id: "calibration-profile",
              version: "1.0.0"
            },
            uncertainty: {
              kind: "absolute",
              plusMinus: 0.01,
              unit: "1",
              basis:
                "calibration artifact"
            }
          })
        ]
      });

    expect(result.uncertainty)
      .toMatchObject({
        kind: "not-propagated",
        componentIds: [
          "measured",
          "calibration"
        ]
      });
    expect(
      result.components[0]
        ?.uncertainty
    ).toEqual({
      kind: "relative",
      fraction: 0.02,
      basis: "test calibration"
    });
    expect(
      result.components[1]
        ?.uncertainty
    ).toEqual({
      kind: "absolute",
      plusMinus: 0.01,
      unit: "1",
      basis:
        "calibration artifact"
    });
  });

  it("preserves existing CalculationQuality uncertainty components without flattening them", () => {
    const result =
      composeScientificAssurance({
        components: [
          component({
            uncertainty: {
              kind:
                "calculation-quality",
              quality: {
                uncertainty: [
                  {
                    kind: "relative",
                    quantityPath: "value.throughput",
                    fraction: 0.03,
                    source:
                      "model-approximation"
                  },
                  {
                    kind: "absolute",
                    quantityPath: "value.radius",
                    plusMinus: 0.01,
                    unit: "mm",
                    source:
                      "calibration"
                  }
                ],
                notes: [
                  "Preserve separately."
                ]
              }
            }
          })
        ]
      });

    expect(result.uncertainty)
      .toMatchObject({
        kind: "not-propagated",
        componentIds: [
          "component-a"
        ]
      });
    expect(
      result.components[0]
        ?.uncertainty
    ).toEqual({
      kind:
        "calculation-quality",
      quality: {
        uncertainty: [
          {
            kind: "relative",
            quantityPath: "value.throughput",
            fraction: 0.03,
            source:
              "model-approximation"
          },
          {
            kind: "absolute",
            quantityPath: "value.radius",
            plusMinus: 0.01,
            unit: "mm",
            source:
              "calibration"
          }
        ],
        notes: [
          "Preserve separately."
        ]
      }
    });
  });

  it("keeps unknown uncertainty stronger than not-quantified or quantified summaries", () => {
    const result =
      composeScientificAssurance({
        components: [
          component(),
          component({
            componentId: "unknown-u",
            uncertainty: {
              kind: "unknown",
              limitation:
                "No uncertainty characterization exists."
            }
          })
        ]
      });

    expect(result.uncertainty)
      .toMatchObject({
        kind: "unknown",
        componentIds: [
          "unknown-u"
        ]
      });
  });

  it("keeps missing required evidence visible instead of upgrading it away", () => {
    const result =
      composeScientificAssurance({
        components: [
          component({
            componentId:
              "missing-evidence",
            evidence: []
          })
        ]
      });

    expect(result.evidenceStatus)
      .toBe(
        "missing-required-evidence"
      );
    expect(
      result
        .missingRequiredEvidenceComponentIds
    ).toEqual([
      "missing-evidence"
    ]);
    expect(result.scientificStatus)
      .toBe("unknown");
    expect(
      result
        .weakestRequiredComponentIds
    ).toEqual([
      "missing-evidence"
    ]);
  });

  it("uses the canonical fixture as a deterministic Photivra-owned evidence identity", () => {
    const result =
      composeScientificAssurance({
        components: [
          component({
            componentId:
              fixture.fixtureId,
            sourceIdentity: {
              kind: "fixture",
              id: fixture.fixtureId,
              version:
                fixture.schemaVersion
            },
            basisKind:
              "photivra-model-assumption",
            scientificStatus:
              "approximation",
            evidence: [{
              sourceOrigin:
                fixture.provenance
                  .sourceOrigin,
              sourceReference:
                fixture.provenance
                  .sourceReference,
              reuseStatus:
                fixture.provenance
                  .reuseStatus
            }],
            uncertainty: {
              kind:
                "not-quantified",
              limitation:
                "Synthetic canonical test fixture does not claim measured real-world uncertainty."
            }
          })
        ]
      });

    expect(
      result.components[0]
        ?.sourceIdentity
    ).toEqual({
      kind: "fixture",
      id: "basic-reference-scene",
      version: "0.1.0"
    });
    expect(
      result.components[0]
        ?.evidence
    ).toEqual([{
      sourceOrigin: "photivra",
      sourceReference:
        "test:basic-reference-scene",
      reuseStatus:
        "photivra-owned"
    }]);
  });

  it("fails closed on duplicate IDs, no required component, and malformed uncertainty", () => {
    expect(() =>
      composeScientificAssurance({
        components: [
          component(),
          component()
        ]
      })
    ).toThrow(
      "duplicate componentId"
    );

    expect(() =>
      composeScientificAssurance({
        components: [
          component({
            required: false
          })
        ]
      })
    ).toThrow(
      "At least one scientific-assurance component must be required"
    );

    expect(() =>
      composeScientificAssurance({
        components: [
          component({
            uncertainty: {
              kind: "relative",
              fraction: 1.2,
              basis: "invalid"
            }
          })
        ]
      })
    ).toThrow(
      "fraction must be less than or equal to one"
    );
  });
});
