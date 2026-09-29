// SPDX-License-Identifier: Apache-2.0

import {
  approximationResult,
  type CalculationProvenance,
  type CalculationResult
} from "../core/calculation-result.js";
import {
  parseEvidenceList,
  type EvidenceProvenance
} from "../core/evidence-provenance.js";
import { InvalidScientificInputError } from "../core/validation.js";
import type { RasterPoint, RasterRect } from "../output/capture-geometry.js";
import {
  calculateCaptureExposureWindows,
  type ExposureBoundarySchedule,
  type SourcedCaptureTimingSeconds
} from "./exposure-window.js";
import {
  calculateSensorReadoutTiming,
  type CaptureShutterMechanism,
  type NativeSensorReadoutScanDirection,
  type SensorReadoutTimingDeclaration
} from "./readout-timing.js";
import type { NativeImageRaster } from "./sensor-geometry.js";

export type ReadoutExposureBoundaryId = "opening" | "closing";

export type ReadoutExposureSpatialPhaseOrientation =
  | "same"
  | "reversed";

export interface ReadoutExposureBoundarySpatialLink {
  boundary: ReadoutExposureBoundaryId;
  /**
   * Relationship between normalized rolling-readout scan phase and the
   * selected electronic exposure-boundary scan phase.
   *
   * "same": boundary normalized phase = readout normalized phase.
   * "reversed": boundary normalized phase = 1 - readout normalized phase.
   *
   * This does not establish absolute temporal synchronization.
   */
  phaseOrientation: ReadoutExposureSpatialPhaseOrientation;
  /**
   * Evidence supporting the relationship itself.
   *
   * The readout direction/timing and exposure-boundary direction/timing retain
   * their own separate evidence.
   */
  evidence: readonly EvidenceProvenance[];
}

export type ReadoutExposureTimingLinkageDeclaration =
  | {
      /**
       * Photivra asserts no readout↔exposure relationship for this capture.
       * This is not evidence that the physical processes are independent.
       */
      kind: "unlinked";
      links?: never;
    }
  | {
      /**
       * One or more exposure boundaries are explicitly related to rolling
       * readout by normalized native-sensor spatial phase.
       */
      kind: "spatial-phase-linked";
      links: readonly ReadoutExposureBoundarySpatialLink[];
    };

export interface AssessReadoutExposureTimingLinkageInput {
  nativeRaster: NativeImageRaster;
  activeCaptureRect?: RasterRect;
  shutterMechanism: CaptureShutterMechanism;
  readout: SensorReadoutTimingDeclaration;
  nominalExposureDurationSeconds: SourcedCaptureTimingSeconds;
  opening: ExposureBoundarySchedule;
  closing: ExposureBoundarySchedule;
  linkage: ReadoutExposureTimingLinkageDeclaration;
  samplePointsNative?: readonly RasterPoint[];
}

export interface ReadoutExposureBoundarySpatialLinkAssessment {
  boundary: ReadoutExposureBoundaryId;
  boundaryActuator: "electronic";
  phaseOrientation: ReadoutExposureSpatialPhaseOrientation;
  normalizedPhaseRelationship:
    | "boundary-phase-equals-readout-phase"
    | "boundary-phase-equals-one-minus-readout-phase";
  relationshipEvidence: readonly EvidenceProvenance[];
  readoutDirectionNative: NativeSensorReadoutScanDirection;
  boundaryDirectionNative: NativeSensorReadoutScanDirection;
  /**
   * First-to-last rolling sensor spatial sampling skew.
   */
  readoutSpatialSamplingSkewSeconds: number;
  /**
   * First-to-last exposure-boundary traversal duration.
   */
  boundaryTraversalDurationSeconds: number;
  /**
   * Derived descriptive ratio only. A value of 1 does not prove temporal
   * synchronization or a common clock origin.
   */
  boundaryTraversalToReadoutSpatialSkewRatio: number;
  absoluteTemporalAlignment: "not-established";
}

export interface ReadoutExposureTimingLinkageAssessment {
  linkageKind: ReadoutExposureTimingLinkageDeclaration["kind"];
  relationshipMeaning:
    | "no-readout-exposure-relationship-asserted"
    | "normalized-spatial-phase-relationship-asserted";
  readoutMode: "rolling" | "global";
  shutterMechanism: CaptureShutterMechanism;
  activeCaptureRect: RasterRect;
  absoluteTemporalAlignment: "not-established";
  /**
   * Capture data-readout duration is preserved for diagnostics but is not used
   * to validate any exposure-boundary linkage.
   */
  captureReadoutDurationSeconds: number;
  links: readonly ReadoutExposureBoundarySpatialLinkAssessment[];
  componentProvenance: {
    sensorReadout: CalculationProvenance;
    exposureWindows: CalculationProvenance;
  };
}

type UnknownRecord = Record<string, unknown>;

const BOUNDARIES = new Set<ReadoutExposureBoundaryId>([
  "opening",
  "closing"
]);

const PHASE_ORIENTATIONS =
  new Set<ReadoutExposureSpatialPhaseOrientation>([
    "same",
    "reversed"
  ]);

function requireRecord(value: unknown, path: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidScientificInputError(path + " must be an object.");
  }
  return value as UnknownRecord;
}

function parseSpatialLink(
  value: unknown,
  path: string
): ReadoutExposureBoundarySpatialLink {
  const record = requireRecord(value, path);

  if (
    typeof record.boundary !== "string" ||
    !BOUNDARIES.has(record.boundary as ReadoutExposureBoundaryId)
  ) {
    throw new InvalidScientificInputError(path + ".boundary is invalid.");
  }

  if (
    typeof record.phaseOrientation !== "string" ||
    !PHASE_ORIENTATIONS.has(
      record.phaseOrientation as ReadoutExposureSpatialPhaseOrientation
    )
  ) {
    throw new InvalidScientificInputError(
      path + ".phaseOrientation is invalid."
    );
  }

  return {
    boundary: record.boundary as ReadoutExposureBoundaryId,
    phaseOrientation:
      record.phaseOrientation as ReadoutExposureSpatialPhaseOrientation,
    evidence: parseEvidenceList(record.evidence, path + ".evidence")
  };
}

function parseLinkageDeclaration(
  value: unknown
): ReadoutExposureTimingLinkageDeclaration {
  const record = requireRecord(value, "linkage");

  if (record.kind === "unlinked") {
    if (record.links !== undefined) {
      throw new InvalidScientificInputError(
        "linkage.links must be omitted when linkage.kind is unlinked."
      );
    }
    return { kind: "unlinked" };
  }

  if (record.kind !== "spatial-phase-linked") {
    throw new InvalidScientificInputError("linkage.kind is invalid.");
  }

  if (!Array.isArray(record.links) || record.links.length === 0) {
    throw new InvalidScientificInputError(
      "linkage.links must be a non-empty array for spatial-phase-linked linkage."
    );
  }

  const links = record.links.map((entry, index) =>
    parseSpatialLink(entry, "linkage.links[" + index + "]")
  );

  const seen = new Set<ReadoutExposureBoundaryId>();
  for (const link of links) {
    if (seen.has(link.boundary)) {
      throw new InvalidScientificInputError(
        "linkage.links must not contain duplicate boundary links."
      );
    }
    seen.add(link.boundary);
  }

  return {
    kind: "spatial-phase-linked",
    links
  };
}

function oppositeDirection(
  direction: NativeSensorReadoutScanDirection
): NativeSensorReadoutScanDirection {
  switch (direction) {
    case "top-to-bottom":
      return "bottom-to-top";
    case "bottom-to-top":
      return "top-to-bottom";
    case "left-to-right":
      return "right-to-left";
    case "right-to-left":
      return "left-to-right";
  }
}

function expectedBoundaryDirection(
  readoutDirection: NativeSensorReadoutScanDirection,
  phaseOrientation: ReadoutExposureSpatialPhaseOrientation
): NativeSensorReadoutScanDirection {
  return phaseOrientation === "same"
    ? readoutDirection
    : oppositeDirection(readoutDirection);
}

/**
 * Assesses an explicitly declared relationship between rolling sensor readout
 * spatial phase and one or more electronic exposure-boundary scans.
 *
 * This contract is deliberately weaker than temporal synchronization. It can
 * establish that two schedules traverse the same native spatial phase ordering
 * (or its reverse), but it does not establish when sensor data readout occurs
 * relative to exposure start/end.
 *
 * The total capture data-readout duration is preserved diagnostically and is
 * never used to validate the relationship. Different rolling-readout spatial
 * skew and exposure-boundary traversal durations are allowed; their ratio is
 * reported without implying a shared clock origin.
 */
export function assessReadoutExposureTimingLinkage(
  input: AssessReadoutExposureTimingLinkageInput
): CalculationResult<ReadoutExposureTimingLinkageAssessment> {
  const linkage = parseLinkageDeclaration(input.linkage);

  const sensorReadout = calculateSensorReadoutTiming({
    nativeRaster: input.nativeRaster,
    ...(input.activeCaptureRect === undefined
      ? {}
      : { activeCaptureRect: input.activeCaptureRect }),
    shutterMechanism: input.shutterMechanism,
    readout: input.readout,
    ...(input.samplePointsNative === undefined
      ? {}
      : { samplePointsNative: input.samplePointsNative })
  });

  const exposureWindows = calculateCaptureExposureWindows({
    nativeRaster: input.nativeRaster,
    ...(input.activeCaptureRect === undefined
      ? {}
      : { activeCaptureRect: input.activeCaptureRect }),
    shutterMechanism: input.shutterMechanism,
    nominalExposureDurationSeconds:
      input.nominalExposureDurationSeconds,
    opening: input.opening,
    closing: input.closing,
    ...(input.samplePointsNative === undefined
      ? {}
      : { samplePointsNative: input.samplePointsNative })
  });

  if (linkage.kind === "unlinked") {
    return approximationResult(
      {
        linkageKind: "unlinked",
        relationshipMeaning:
          "no-readout-exposure-relationship-asserted",
        readoutMode: sensorReadout.value.readoutMode,
        shutterMechanism: input.shutterMechanism,
        activeCaptureRect: {
          ...sensorReadout.value.activeCaptureRect
        },
        absoluteTemporalAlignment: "not-established",
        captureReadoutDurationSeconds:
          sensorReadout.value.captureReadoutDurationSeconds.value,
        links: [],
        componentProvenance: {
          sensorReadout: sensorReadout.provenance,
          exposureWindows: exposureWindows.provenance
        }
      },
      "readout-exposure-spatial-linkage",
      "1.0.0",
      [
        "Unlinked means Photivra asserts no readout-to-exposure relationship for this capture; it does not prove the physical processes are independent.",
        "Sensor data-readout timing and exposure-window timing retain independent provenance and semantics.",
        "Absolute temporal alignment between data readout and exposure boundaries is not established."
      ]
    );
  }

  if (sensorReadout.value.scan === null) {
    throw new InvalidScientificInputError(
      "spatial-phase-linked linkage requires rolling sensor readout with a spatial scan."
    );
  }

  const assessments =
    linkage.links.map<ReadoutExposureBoundarySpatialLinkAssessment>(
      (link) => {
        const boundary =
          link.boundary === "opening"
            ? exposureWindows.value.opening
            : exposureWindows.value.closing;

        if (boundary.actuator !== "electronic") {
          throw new InvalidScientificInputError(
            "A readout spatial-phase link may target only an electronic exposure boundary."
          );
        }

        if (
          boundary.schedule.kind !==
          "uniform-linear-native-scan"
        ) {
          throw new InvalidScientificInputError(
            "A readout spatial-phase link requires the selected exposure boundary to use a uniform-linear native scan."
          );
        }

        const readoutDirection =
          sensorReadout.value.scan.directionNative.value;
        const boundaryDirection =
          boundary.schedule.directionNative.value;
        const expectedDirection = expectedBoundaryDirection(
          readoutDirection,
          link.phaseOrientation
        );

        if (boundaryDirection !== expectedDirection) {
          throw new InvalidScientificInputError(
            "Declared readout/exposure spatial phase orientation contradicts the readout and exposure-boundary scan directions."
          );
        }

        const readoutSpatialSamplingSkewSeconds =
          sensorReadout.value.scan.spatialSamplingSkewSeconds.value;
        const boundaryTraversalDurationSeconds =
          boundary.schedule.traversalDurationSeconds.value;

        return {
          boundary: link.boundary,
          boundaryActuator: "electronic",
          phaseOrientation: link.phaseOrientation,
          normalizedPhaseRelationship:
            link.phaseOrientation === "same"
              ? "boundary-phase-equals-readout-phase"
              : "boundary-phase-equals-one-minus-readout-phase",
          relationshipEvidence: link.evidence,
          readoutDirectionNative: readoutDirection,
          boundaryDirectionNative: boundaryDirection,
          readoutSpatialSamplingSkewSeconds,
          boundaryTraversalDurationSeconds,
          boundaryTraversalToReadoutSpatialSkewRatio:
            boundaryTraversalDurationSeconds /
            readoutSpatialSamplingSkewSeconds,
          absoluteTemporalAlignment: "not-established"
        };
      }
    );

  return approximationResult(
    {
      linkageKind: "spatial-phase-linked",
      relationshipMeaning:
        "normalized-spatial-phase-relationship-asserted",
      readoutMode: sensorReadout.value.readoutMode,
      shutterMechanism: input.shutterMechanism,
      activeCaptureRect: {
        ...sensorReadout.value.activeCaptureRect
      },
      absoluteTemporalAlignment: "not-established",
      captureReadoutDurationSeconds:
        sensorReadout.value.captureReadoutDurationSeconds.value,
      links: assessments,
      componentProvenance: {
        sensorReadout: sensorReadout.provenance,
        exposureWindows: exposureWindows.provenance
      }
    },
    "readout-exposure-spatial-linkage",
    "1.0.0",
    [
      "The linkage establishes normalized native-sensor spatial phase/order only, not absolute temporal synchronization.",
      "Every asserted boundary link carries evidence separate from the evidence for the underlying readout and exposure timing facts.",
      "Only electronic exposure boundaries may be linked to rolling sensor readout spatial phase.",
      "Same phase orientation requires matching native scan direction; reversed phase orientation requires the exact opposite direction on the same native axis.",
      "Rolling readout spatial skew and exposure-boundary traversal duration may differ; their ratio is descriptive and does not establish a common clock origin.",
      "Capture data-readout duration is not used to validate exposure-boundary timing linkage.",
      "Active capture, native coordinate semantics and shutter mechanism are shared because both component schedules are resolved from the same input.",
      "Sensor readout and exposure-window component provenance remain visible; linkage does not upgrade either component to calibrated status.",
      "No camera-specific timing relationship is inferred from shutter mechanism, sensor architecture metadata, output resolution or adjacent specifications."
    ]
  );
}
