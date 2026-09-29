import { describe, expect, it } from "vitest";

import {
  assessReadoutExposureTimingLinkage,
  type ExposureBoundarySchedule,
  type ReadoutExposureTimingLinkageDeclaration,
  type RollingSensorReadoutTimingDeclaration,
  type SourcedCaptureTimingSeconds,
  type SourcedSensorTimingSeconds
} from "../src/index.js";

type PhotivraOwnedEvidence = readonly [
  {
    sourceOrigin: "photivra";
    sourceReference: string;
    reuseStatus: "photivra-owned";
  }
];

const nativeRaster = {
  pixelWidth: 6000,
  pixelHeight: 4000
};

const evidence = (
  sourceReference: string
): PhotivraOwnedEvidence =>
  [
    {
      sourceOrigin: "photivra",
      sourceReference,
      reuseStatus: "photivra-owned"
    }
  ] as const;

const sensorSeconds = (
  value: number,
  sourceReference: string
): SourcedSensorTimingSeconds => ({
  value,
  unit: "s",
  evidence: evidence(sourceReference)
});

const captureSeconds = (
  value: number,
  sourceReference: string
): SourcedCaptureTimingSeconds => ({
  value,
  unit: "s",
  evidence: evidence(sourceReference)
});

const rollingReadout = (
  direction:
    | "top-to-bottom"
    | "bottom-to-top"
    | "left-to-right"
    | "right-to-left" = "top-to-bottom",
  spatialSkewSeconds = 0.02
): RollingSensorReadoutTimingDeclaration => ({
  readoutMode: "rolling",
  captureReadoutDurationSeconds: sensorSeconds(
    0.031,
    "test:data-readout-duration"
  ),
  scanDirectionNative: {
    value: direction,
    evidence: evidence("test:readout-direction")
  },
  spatialSamplingSkewSeconds: sensorSeconds(
    spatialSkewSeconds,
    "test:readout-spatial-skew"
  )
});

const simultaneous = (): ExposureBoundarySchedule => ({
  kind: "simultaneous"
});

const scanned = (
  direction:
    | "top-to-bottom"
    | "bottom-to-top"
    | "left-to-right"
    | "right-to-left",
  traversalSeconds: number,
  sourceReference: string
): ExposureBoundarySchedule => ({
  kind: "uniform-linear-native-scan",
  directionNative: {
    value: direction,
    evidence: evidence(sourceReference + ":direction")
  },
  traversalDurationSeconds: captureSeconds(
    traversalSeconds,
    sourceReference + ":duration"
  )
});

const link = (
  boundary: "opening" | "closing",
  phaseOrientation: "same" | "reversed"
): ReadoutExposureTimingLinkageDeclaration => ({
  kind: "spatial-phase-linked",
  links: [
    {
      boundary,
      phaseOrientation,
      evidence: evidence(
        "test:relationship:" + boundary + ":" + phaseOrientation
      )
    }
  ]
});

describe("readout/exposure spatial linkage", () => {
  it("keeps unlinked schedules explicitly unasserted rather than calling them physically independent", () => {
    const result = assessReadoutExposureTimingLinkage({
      nativeRaster,
      shutterMechanism: "electronic",
      readout: rollingReadout(),
      nominalExposureDurationSeconds: captureSeconds(
        0.01,
        "test:nominal"
      ),
      opening: scanned(
        "top-to-bottom",
        0.012,
        "test:opening"
      ),
      closing: scanned(
        "top-to-bottom",
        0.012,
        "test:closing"
      ),
      linkage: {
        kind: "unlinked"
      }
    });

    expect(result.value.linkageKind).toBe("unlinked");
    expect(result.value.relationshipMeaning).toBe(
      "no-readout-exposure-relationship-asserted"
    );
    expect(result.value.links).toEqual([]);
    expect(result.value.absoluteTemporalAlignment).toBe(
      "not-established"
    );
    expect(result.provenance.assumptions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("does not prove")
      ])
    );
  });

  it("validates a same-phase link to an electronic opening boundary", () => {
    const result = assessReadoutExposureTimingLinkage({
      nativeRaster,
      shutterMechanism: "electronic-first-curtain",
      readout: rollingReadout("top-to-bottom", 0.02),
      nominalExposureDurationSeconds: captureSeconds(
        0.01,
        "test:nominal"
      ),
      opening: scanned(
        "top-to-bottom",
        0.01,
        "test:opening"
      ),
      closing: scanned(
        "top-to-bottom",
        0.015,
        "test:closing"
      ),
      linkage: link("opening", "same")
    }).value;

    const assessed = result.links[0];
    expect(assessed?.boundaryActuator).toBe("electronic");
    expect(assessed?.normalizedPhaseRelationship).toBe(
      "boundary-phase-equals-readout-phase"
    );
    expect(
      assessed?.boundaryTraversalToReadoutSpatialSkewRatio
    ).toBeCloseTo(0.5, 12);
    expect(assessed?.absoluteTemporalAlignment).toBe(
      "not-established"
    );
  });

  it("validates a reversed-phase link only when the native direction is exactly opposite", () => {
    const result = assessReadoutExposureTimingLinkage({
      nativeRaster,
      shutterMechanism: "electronic",
      readout: rollingReadout("left-to-right", 0.01),
      nominalExposureDurationSeconds: captureSeconds(
        0.005,
        "test:nominal"
      ),
      opening: scanned(
        "right-to-left",
        0.02,
        "test:opening"
      ),
      closing: scanned(
        "right-to-left",
        0.02,
        "test:closing"
      ),
      linkage: link("opening", "reversed")
    }).value;

    expect(result.links[0]?.normalizedPhaseRelationship).toBe(
      "boundary-phase-equals-one-minus-readout-phase"
    );
    expect(result.links[0]?.readoutDirectionNative).toBe(
      "left-to-right"
    );
    expect(result.links[0]?.boundaryDirectionNative).toBe(
      "right-to-left"
    );
  });

  it("allows different spatial timing spans without inventing synchronization", () => {
    const result = assessReadoutExposureTimingLinkage({
      nativeRaster,
      shutterMechanism: "electronic",
      readout: rollingReadout("top-to-bottom", 0.024),
      nominalExposureDurationSeconds: captureSeconds(
        0.004,
        "test:nominal"
      ),
      opening: scanned(
        "top-to-bottom",
        0.008,
        "test:opening"
      ),
      closing: scanned(
        "top-to-bottom",
        0.012,
        "test:closing"
      ),
      linkage: link("opening", "same")
    }).value;

    const assessed = result.links[0];
    expect(
      assessed?.readoutSpatialSamplingSkewSeconds.value
    ).toBe(0.024);
    expect(
      assessed?.boundaryTraversalDurationSeconds.value
    ).toBe(0.008);
    expect(
      assessed?.boundaryTraversalToReadoutSpatialSkewRatio
    ).toBeCloseTo(1 / 3, 12);
    expect(result.absoluteTemporalAlignment).toBe(
      "not-established"
    );
  });

  it("preserves evidence and units for every linked timing fact", () => {
    const result = assessReadoutExposureTimingLinkage({
      nativeRaster,
      shutterMechanism: "electronic",
      readout: rollingReadout(),
      nominalExposureDurationSeconds: captureSeconds(
        0.01,
        "test:nominal"
      ),
      opening: scanned(
        "top-to-bottom",
        0.01,
        "test:opening"
      ),
      closing: scanned(
        "top-to-bottom",
        0.01,
        "test:closing"
      ),
      linkage: link("opening", "same")
    }).value;

    expect(result.captureReadoutDurationSeconds.unit).toBe("s");
    expect(
      result.captureReadoutDurationSeconds.evidence[0]
        ?.sourceReference
    ).toBe("test:data-readout-duration");

    const assessed = result.links[0];
    expect(assessed?.readoutSpatialSamplingSkewSeconds.unit).toBe(
      "s"
    );
    expect(
      assessed?.readoutSpatialSamplingSkewSeconds.evidence[0]
        ?.sourceReference
    ).toBe("test:readout-spatial-skew");
    expect(assessed?.boundaryTraversalDurationSeconds.unit).toBe(
      "s"
    );
    expect(
      assessed?.boundaryTraversalDurationSeconds.evidence[0]
        ?.sourceReference
    ).toBe("test:opening:duration");
    expect(
      assessed?.relationshipEvidence[0]?.sourceReference
    ).toBe("test:relationship:opening:same");
  });

  it("never uses total data-readout duration to validate the spatial relationship", () => {
    const result = assessReadoutExposureTimingLinkage({
      nativeRaster,
      shutterMechanism: "electronic",
      readout: {
        ...rollingReadout(),
        captureReadoutDurationSeconds: sensorSeconds(
          0.5,
          "test:intentionally-different-data-duration"
        )
      },
      nominalExposureDurationSeconds: captureSeconds(
        0.01,
        "test:nominal"
      ),
      opening: scanned(
        "top-to-bottom",
        0.01,
        "test:opening"
      ),
      closing: scanned(
        "top-to-bottom",
        0.01,
        "test:closing"
      ),
      linkage: link("opening", "same")
    }).value;

    expect(result.links).toHaveLength(1);
    expect(result.captureReadoutDurationSeconds.value).toBe(0.5);
  });

  it("supports separate links to both electronic boundaries", () => {
    const result = assessReadoutExposureTimingLinkage({
      nativeRaster,
      shutterMechanism: "electronic",
      readout: rollingReadout("top-to-bottom", 0.02),
      nominalExposureDurationSeconds: captureSeconds(
        0.01,
        "test:nominal"
      ),
      opening: scanned(
        "top-to-bottom",
        0.01,
        "test:opening"
      ),
      closing: scanned(
        "bottom-to-top",
        0.015,
        "test:closing"
      ),
      linkage: {
        kind: "spatial-phase-linked",
        links: [
          {
            boundary: "opening",
            phaseOrientation: "same",
            evidence: evidence("test:opening-link")
          },
          {
            boundary: "closing",
            phaseOrientation: "reversed",
            evidence: evidence("test:closing-link")
          }
        ]
      }
    }).value;

    expect(result.links.map((item) => item.boundary)).toEqual([
      "opening",
      "closing"
    ]);
  });

  it("rejects links to mechanical boundaries", () => {
    expect(() =>
      assessReadoutExposureTimingLinkage({
        nativeRaster,
        shutterMechanism: "electronic-first-curtain",
        readout: rollingReadout(),
        nominalExposureDurationSeconds: captureSeconds(
          0.01,
          "test:nominal"
        ),
        opening: scanned(
          "top-to-bottom",
          0.01,
          "test:opening"
        ),
        closing: scanned(
          "top-to-bottom",
          0.01,
          "test:closing"
        ),
        linkage: link("closing", "same")
      })
    ).toThrow("only an electronic exposure boundary");
  });

  it("rejects spatial links for global readout or simultaneous exposure boundaries", () => {
    expect(() =>
      assessReadoutExposureTimingLinkage({
        nativeRaster,
        shutterMechanism: "electronic",
        readout: {
          readoutMode: "global",
          captureReadoutDurationSeconds: sensorSeconds(
            0.01,
            "test:global"
          )
        },
        nominalExposureDurationSeconds: captureSeconds(
          0.01,
          "test:nominal"
        ),
        opening: scanned(
          "top-to-bottom",
          0.01,
          "test:opening"
        ),
        closing: scanned(
          "top-to-bottom",
          0.01,
          "test:closing"
        ),
        linkage: link("opening", "same")
      })
    ).toThrow("requires rolling sensor readout");

    expect(() =>
      assessReadoutExposureTimingLinkage({
        nativeRaster,
        shutterMechanism: "electronic",
        readout: rollingReadout(),
        nominalExposureDurationSeconds: captureSeconds(
          0.01,
          "test:nominal"
        ),
        opening: simultaneous(),
        closing: simultaneous(),
        linkage: link("opening", "same")
      })
    ).toThrow("requires the selected exposure boundary");
  });

  it("rejects contradictory same/reversed phase direction claims", () => {
    expect(() =>
      assessReadoutExposureTimingLinkage({
        nativeRaster,
        shutterMechanism: "electronic",
        readout: rollingReadout("top-to-bottom"),
        nominalExposureDurationSeconds: captureSeconds(
          0.01,
          "test:nominal"
        ),
        opening: scanned(
          "bottom-to-top",
          0.01,
          "test:opening"
        ),
        closing: scanned(
          "bottom-to-top",
          0.01,
          "test:closing"
        ),
        linkage: link("opening", "same")
      })
    ).toThrow("contradicts");

    expect(() =>
      assessReadoutExposureTimingLinkage({
        nativeRaster,
        shutterMechanism: "electronic",
        readout: rollingReadout("left-to-right"),
        nominalExposureDurationSeconds: captureSeconds(
          0.01,
          "test:nominal"
        ),
        opening: scanned(
          "top-to-bottom",
          0.01,
          "test:opening"
        ),
        closing: scanned(
          "top-to-bottom",
          0.01,
          "test:closing"
        ),
        linkage: link("opening", "reversed")
      })
    ).toThrow("contradicts");
  });

  it("fails closed on duplicate links and missing relationship evidence", () => {
    expect(() =>
      assessReadoutExposureTimingLinkage({
        nativeRaster,
        shutterMechanism: "electronic",
        readout: rollingReadout(),
        nominalExposureDurationSeconds: captureSeconds(
          0.01,
          "test:nominal"
        ),
        opening: scanned(
          "top-to-bottom",
          0.01,
          "test:opening"
        ),
        closing: scanned(
          "top-to-bottom",
          0.01,
          "test:closing"
        ),
        linkage: {
          kind: "spatial-phase-linked",
          links: [
            {
              boundary: "opening",
              phaseOrientation: "same",
              evidence: evidence("test:first")
            },
            {
              boundary: "opening",
              phaseOrientation: "same",
              evidence: evidence("test:duplicate")
            }
          ]
        }
      })
    ).toThrow("duplicate boundary links");

    expect(() =>
      assessReadoutExposureTimingLinkage({
        nativeRaster,
        shutterMechanism: "electronic",
        readout: rollingReadout(),
        nominalExposureDurationSeconds: captureSeconds(
          0.01,
          "test:nominal"
        ),
        opening: scanned(
          "top-to-bottom",
          0.01,
          "test:opening"
        ),
        closing: scanned(
          "top-to-bottom",
          0.01,
          "test:closing"
        ),
        linkage: {
          kind: "spatial-phase-linked",
          links: [
            {
              boundary: "opening",
              phaseOrientation: "same",
              evidence: []
            }
          ]
        } as never
      })
    ).toThrow("must be a non-empty array");
  });

  it("keeps active-capture geometry shared between both component schedules", () => {
    const result = assessReadoutExposureTimingLinkage({
      nativeRaster,
      activeCaptureRect: {
        x: 1000,
        y: 500,
        width: 3000,
        height: 2000
      },
      shutterMechanism: "electronic",
      readout: rollingReadout(),
      nominalExposureDurationSeconds: captureSeconds(
        0.01,
        "test:nominal"
      ),
      opening: scanned(
        "top-to-bottom",
        0.01,
        "test:opening"
      ),
      closing: scanned(
        "top-to-bottom",
        0.01,
        "test:closing"
      ),
      linkage: link("opening", "same"),
      samplePointsNative: [{ x: 2500, y: 1500 }]
    }).value;

    expect(result.activeCaptureRect).toEqual({
      x: 1000,
      y: 500,
      width: 3000,
      height: 2000
    });
  });
});
