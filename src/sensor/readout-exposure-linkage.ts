// SPDX-License-Identifier: Apache-2.0

/**
 * Module boundary and integration notes.
 * Assesses an explicitly declared relationship between rolling sensor readout spatial phase and one or
 * more electronic exposure-boundary scans. This contract is deliberately weaker than temporal
 * synchronization. It can establish that two schedules traverse the same native spatial phase ordering
 * (or its reverse), but it does not establish when sensor data readout occurs relative to exposure
 * start/end. The total capture data-readout duration is preserved diagnostically and is never used to
 * validate the relationship. Different rolling-readout spatial skew and exposure-boundary traversal
 * durations are allowed; their ratio is reported without implying a shared clock origin.
 * @see docs/MOTION_AND_SIGNAL.md for equations, coordinate/unit conventions, blockers and support
 * limits.
 */

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
  type CalculateCaptureExposureWindowsInput,
  type ExposureBoundarySchedule,
  type UniformLinearExposureBoundarySchedule,
  type SourcedCaptureTimingSeconds
} from "./exposure-window.js";
import {
  calculateSensorReadoutTiming,
  type CaptureShutterMechanism,
  type NativeSensorReadoutScanDirection,
  type RollingSensorReadoutTimingDeclaration,
  type SensorReadoutTimingDeclaration,
  type SourcedSensorTimingSeconds
} from "./readout-timing.js";
import type { NativeImageRaster } from "./sensor-geometry.js";
import { requireInputObject } from "../core/record-validation.js";

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
  readoutSpatialSamplingSkewSeconds: SourcedSensorTimingSeconds;
  /**
   * First-to-last exposure-boundary traversal duration.
   */
  boundaryTraversalDurationSeconds: SourcedCaptureTimingSeconds;
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
  captureReadoutDurationSeconds: SourcedSensorTimingSeconds;
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
  requireInputObject(input, "assessReadoutExposureTimingLinkage input");
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
          sensorReadout.value.captureReadoutDurationSeconds,
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

  const readoutScan = sensorReadout.value.scan;
  if (readoutScan === null) {
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
          readoutScan.directionNative.value;
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
          readoutScan.spatialSamplingSkewSeconds;
        const boundaryTraversalDurationSeconds =
          boundary.schedule.traversalDurationSeconds;

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
            boundaryTraversalDurationSeconds.value /
            readoutSpatialSamplingSkewSeconds.value,
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
        sensorReadout.value.captureReadoutDurationSeconds,
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

/** Model identity of the electronic rolling-shutter (line reset → line read) exposure schedule. */
export const ELECTRONIC_ROLLING_SHUTTER_MODEL = Object.freeze({
  id: "electronic-rolling-shutter-line-reset-read",
  version: "1.0.0"
} as const);

export interface DeriveElectronicRollingShutterExposureScheduleInput {
  /** Rolling readout declaration whose scan direction and spatial skew drive both exposure boundaries. */
  readout: RollingSensorReadoutTimingDeclaration;
  /** Per-line integration time between line reset and line read. */
  nominalExposureDurationSeconds: SourcedCaptureTimingSeconds;
  /**
   * Evidence that this capture uses a fully electronic line-sequential (rolling) shutter whose reset
   * scan runs at the readout line rate. This is the explicit linkage contract the domain rules require
   * before sensor readout timing may drive exposure-window timing.
   */
  linkageEvidence: readonly EvidenceProvenance[];
}

/**
 * Exposure-window schedule of an electronic rolling shutter. Its `shutterMechanism`,
 * `nominalExposureDurationSeconds`, `opening` and `closing` fields form a complete exposure schedule, so
 * they can be passed as a native RAW / environment `exposureWindow` or spread into a production
 * `temporalCapture.exposureWindowInput` (see {@link toCaptureExposureSchedule}).
 */
export interface ElectronicRollingShutterExposureSchedule {
  modelId: typeof ELECTRONIC_ROLLING_SHUTTER_MODEL.id;
  modelVersion: typeof ELECTRONIC_ROLLING_SHUTTER_MODEL.version;
  shutterMechanism: "electronic";
  nominalExposureDurationSeconds: SourcedCaptureTimingSeconds;
  /** Line-reset scan: a native point at normalized scan position s starts integrating at s·τ. */
  opening: UniformLinearExposureBoundarySchedule;
  /** Line-read scan: the same point stops integrating at T + s·τ. */
  closing: UniformLinearExposureBoundarySchedule;
  /** Explicit linkage declaration accepted by {@link assessReadoutExposureTimingLinkage}. */
  linkage: Extract<ReadoutExposureTimingLinkageDeclaration, { kind: "spatial-phase-linked" }>;
  /** τ: first-to-last exposure-start offset (equal to the readout spatial sampling skew). */
  lineScanSkewSeconds: number;
  /** Every point integrates for exactly the nominal exposure duration T. */
  localExposureDurationSeconds: number;
  limitations: readonly string[];
}

/** The exposure-schedule fields of a derived rolling-shutter schedule, without model metadata. */
export function toCaptureExposureSchedule(
  schedule: ElectronicRollingShutterExposureSchedule
): Pick<CalculateCaptureExposureWindowsInput, "shutterMechanism" | "nominalExposureDurationSeconds" | "opening" | "closing"> {
  return structuredClone({ shutterMechanism: schedule.shutterMechanism,
    nominalExposureDurationSeconds: schedule.nominalExposureDurationSeconds,
    opening: schedule.opening, closing: schedule.closing });
}

/**
 * Derives the exposure-window schedule of a fully electronic rolling shutter from its rolling readout
 * declaration.
 *
 * In a line-sequential CMOS rolling shutter each line is reset, integrates for the exposure time T and
 * is then read; the reset pointer leads the read pointer by T and both advance at the line rate
 * (El Gamal & Eltoukhy 2005; Liang, Chang & Chen 2008). With the uniform-linear scan used throughout
 * this engine, a native point at normalized scan position s ∈ [0, 1] (measured along the declared scan
 * direction over the active capture) integrates over [s·τ, s·τ + T], where τ is the declared
 * first-to-last spatial sampling skew. Both boundaries therefore become uniform-linear scans in the
 * readout direction with traversal τ. Feeding this schedule to the per-site exposure windows makes every
 * consumer that samples motion, moving sources or temporal illumination at local exposure times
 * (environment RAW, rotation quadrature, temporal illumination integration) form rolling-shutter skew,
 * wobble, partial exposure and flicker banding.
 *
 * Approximation: uniform line rate, no line-reset jitter, no global-reset/mechanical-close hybrid, and
 * the active-capture skew is caller-declared (never scaled from a full-frame value).
 * @see docs/MOTION_AND_SIGNAL.md#electronic-rolling-shutter-image-formation
 */
export function deriveElectronicRollingShutterExposureSchedule(
  input: DeriveElectronicRollingShutterExposureScheduleInput
): ElectronicRollingShutterExposureSchedule {
  const record = requireRecord(input, "rollingShutter");
  const readout = requireRecord(record.readout, "rollingShutter.readout");
  if (readout.readoutMode !== "rolling") {
    throw new InvalidScientificInputError(
      "An electronic rolling-shutter exposure schedule requires a rolling sensor readout declaration."
    );
  }
  const linkageEvidence = parseEvidenceList(input.linkageEvidence, "rollingShutter.linkageEvidence");
  const rolling = input.readout;
  // Validate the declaration and the exposure fact through the authoritative calculators.
  const probeRaster = { pixelWidth: 2, pixelHeight: 2 };
  calculateSensorReadoutTiming({ nativeRaster: probeRaster, shutterMechanism: "electronic", readout: rolling });
  const opening: UniformLinearExposureBoundarySchedule = {
    kind: "uniform-linear-native-scan",
    directionNative: { value: rolling.scanDirectionNative.value, evidence: [...rolling.scanDirectionNative.evidence] },
    traversalDurationSeconds: { value: rolling.spatialSamplingSkewSeconds.value, unit: "s",
      evidence: [...rolling.spatialSamplingSkewSeconds.evidence] }
  };
  const closing: UniformLinearExposureBoundarySchedule = structuredClone(opening);
  const nominal = calculateCaptureExposureWindows({ nativeRaster: probeRaster, shutterMechanism: "electronic",
    nominalExposureDurationSeconds: input.nominalExposureDurationSeconds, opening, closing }).value.nominalExposureDurationSeconds;
  return {
    modelId: ELECTRONIC_ROLLING_SHUTTER_MODEL.id,
    modelVersion: ELECTRONIC_ROLLING_SHUTTER_MODEL.version,
    shutterMechanism: "electronic",
    nominalExposureDurationSeconds: { value: nominal.value, unit: "s", evidence: [...nominal.evidence] },
    opening,
    closing,
    linkage: { kind: "spatial-phase-linked", links: [
      { boundary: "opening", phaseOrientation: "same", evidence: linkageEvidence },
      { boundary: "closing", phaseOrientation: "same", evidence: linkageEvidence }] },
    lineScanSkewSeconds: rolling.spatialSamplingSkewSeconds.value,
    localExposureDurationSeconds: nominal.value,
    limitations: [
      "Uniform-linear line timing: each native point integrates over [s·τ, s·τ + T] with s its normalized scan position.",
      "Line-reset jitter, non-uniform line timing, global-reset release and mechanical-close hybrids are not modeled.",
      "The skew τ is the caller-declared active-capture spatial sampling skew; it is never scaled from a full-frame value."
    ]
  };
}

/**
 * True when an exposure schedule is exactly the electronic rolling-shutter schedule derived from this
 * readout declaration (electronic mechanism, both boundaries scanning in the readout direction with
 * traversal equal to the readout spatial skew).
 */
export function isElectronicRollingShutterExposureSchedule(
  schedule: Pick<CalculateCaptureExposureWindowsInput, "shutterMechanism" | "opening" | "closing">,
  readout: SensorReadoutTimingDeclaration
): boolean {
  if (readout.readoutMode !== "rolling" || schedule.shutterMechanism !== "electronic") return false;
  return [schedule.opening, schedule.closing].every((boundary) => boundary.kind === "uniform-linear-native-scan" &&
    boundary.directionNative.value === readout.scanDirectionNative.value &&
    boundary.traversalDurationSeconds.value === readout.spatialSamplingSkewSeconds.value);
}
