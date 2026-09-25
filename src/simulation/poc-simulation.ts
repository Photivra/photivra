// SPDX-License-Identifier: Apache-2.0

import { calculateEquivalentFocalLength35Mm } from "../camera/equivalent-focal-length.js";
import {
  calculateFieldOfView,
  calculateFieldOfViewBounds
} from "../camera/field-of-view.js";
import { calculateProjectedObjectSize } from "../camera/projected-object-size.js";
import type { CalculationProvenance } from "../core/calculation-result.js";
import {
  InvalidScientificInputError,
  requirePositiveFinite
} from "../core/validation.js";
import { calculateExposureValue100 } from "../exposure/exposure.js";
import { calculateProjectedMotionBlur } from "../motion/projected-motion.js";
import { calculateIdealApertureGeometry } from "../optics/aperture.js";
import { estimateEquivalentViewingCircleOfConfusion } from "../optics/circle-of-confusion.js";
import { calculateAiryDisk } from "../optics/diffraction.js";
import { calculateThinLensImageDistance } from "../optics/thin-lens.js";
import {
  calculateDefocusCircle,
  calculateDepthOfField
} from "../optics/depth-of-field.js";
import {
  calculateActiveCaptureFieldOfView,
  calculateOutputFieldOfView,
  resolveCaptureGeometry,
  transformNativeRasterVectorToOriented,
  type ActiveCaptureFieldOfView,
  type CaptureOrientation,
  type OutputFieldOfView,
  type PhysicalBoundsFromOpticalAxisMm,
  type RasterRect,
  type RasterVector,
  type ResolvedCaptureGeometry
} from "../output/capture-geometry.js";
import { calculateCenteredCrop } from "../output/crop.js";
import { calculateSubjectFramingCrop } from "../output/subject-framing-crop.js";
import { calculatePixelPitch } from "../sensor/pixel-pitch.js";
import {
  calculateSensorGeometryMetrics,
  type RasterDimensions,
  type SensorGeometryMetrics,
  type SensorImagingArea
} from "../sensor/sensor-geometry.js";
import type { Vector3 } from "../schema/scene.js";
import { estimateCameraShakeBlur } from "../stabilization/camera-shake.js";

export const POC_SIMULATION_API_VERSION = "0.20.0" as const;

const POC_MAX_PITCH_AXIS_RELATIVE_DIFFERENCE = 0.01;

export interface PocSimulationRequest {
  sensor: {
    widthMm: number;
    heightMm: number;
    pixelWidth: number;
    pixelHeight: number;
  };
  lens: {
    focalLengthMm: number;
    aperture: number;
  };
  exposure: {
    shutterSeconds: number;
    iso: number;
  };
  focus: {
    focusDistanceM: number;
    circleOfConfusionMm?: number;
    equivalentViewingCircleOfConfusion?: {
      referenceSensorWidthMm: number;
      referenceSensorHeightMm: number;
      referenceCircleOfConfusionMm: number;
    };
  };
  crop: {
    /**
     * Legacy centered same-aspect crop factor.
     *
     * When capture geometry is supplied this must remain 1. New callers should
     * use capture.activeCaptureRect/outputCropRect instead of stacking two
     * independent crop models.
     */
    factor: number;
  };
  /**
   * Opt-in staged capture geometry. Omit for exact legacy POC behavior.
   */
  capture?: {
    orientation: CaptureOrientation;
    activeCaptureRect?: RasterRect;
    outputCropRect?: RasterRect;
    outputRaster?: RasterDimensions;
  };
  diffraction: {
    wavelengthNm: number;
  };
  motion: {
    positionM: Vector3;
    velocityMps: Vector3;
  };
  subject?: {
    widthM: number;
    heightM: number;
    distanceM: number;
  };
  defocusSamples?: readonly {
    id: string;
    distanceM: number;
  }[];
  samplingSamples?: readonly {
    id: string;
    widthM: number;
    heightM: number;
    distanceM: number;
  }[];
  motionSamples?: readonly {
    id: string;
    positionM: Vector3;
    velocityMps: Vector3;
  }[];
  subjectCrop?: {
    targetSubjectHeightFraction: number;
  };
  cameraShake?: {
    angularVelocityRadPerSec: {
      yaw: number;
      pitch: number;
    };
    stabilizationStopsEquivalent: number;
  };
  apertureShape?: {
    bladeCount: number;
    firstBladeEdgeAngleDegrees?: number;
  };
  diagnostics?: {
    subjectMotionSampleId?: string;
  };
}

function calculateCroppedFieldOfView(
  sensorWidthMm: number,
  sensorHeightMm: number,
  focalLengthMm: number,
  focusDistanceM: number,
  cropFactor: number
): FieldOfViewSummary {
  const diagonalMm = Math.hypot(sensorWidthMm, sensorHeightMm);
  return {
    horizontalDegrees: calculateFieldOfView({
      focalLengthMm,
      sensorDimensionMm: sensorWidthMm / cropFactor,
      focusDistanceM
    }).value.degrees,
    verticalDegrees: calculateFieldOfView({
      focalLengthMm,
      sensorDimensionMm: sensorHeightMm / cropFactor,
      focusDistanceM
    }).value.degrees,
    diagonalDegrees: calculateFieldOfView({
      focalLengthMm,
      sensorDimensionMm: diagonalMm / cropFactor,
      focusDistanceM
    }).value.degrees
  };
}

function requireUniqueSampleIds(
  label: string,
  samples: readonly { id: string }[] | undefined
): void {
  if (samples === undefined) {
    return;
  }

  const seen = new Set<string>();
  for (const sample of samples) {
    const normalizedId = sample.id.trim();
    if (normalizedId.length === 0) {
      throw new InvalidScientificInputError(
        `${label}[].id must not be empty.`
      );
    }
    if (seen.has(normalizedId)) {
      throw new InvalidScientificInputError(
        `${label}[].id values must be unique; duplicate: ${normalizedId}`
      );
    }
    seen.add(normalizedId);
  }
}

interface FieldOfViewSummary {
  horizontalDegrees: number;
  verticalDegrees: number;
  diagonalDegrees: number;
}

function centeredPhysicalCropBounds(
  bounds: PhysicalBoundsFromOpticalAxisMm,
  cropFactor: number
): PhysicalBoundsFromOpticalAxisMm {
  const centerX = (bounds.left + bounds.right) / 2;
  const centerY = (bounds.top + bounds.bottom) / 2;
  const halfWidth = (bounds.right - bounds.left) / (2 * cropFactor);
  const halfHeight = (bounds.bottom - bounds.top) / (2 * cropFactor);

  return {
    left: centerX - halfWidth,
    right: centerX + halfWidth,
    top: centerY - halfHeight,
    bottom: centerY + halfHeight
  };
}

function calculateFieldOfViewForPhysicalBounds(
  bounds: PhysicalBoundsFromOpticalAxisMm,
  focalLengthMm: number,
  focusDistanceM: number
): FieldOfViewSummary {
  const horizontal = calculateFieldOfViewBounds({
    focalLengthMm,
    minimumSensorCoordinateMm: bounds.left,
    maximumSensorCoordinateMm: bounds.right,
    focusDistanceM
  }).value;
  const vertical = calculateFieldOfViewBounds({
    focalLengthMm,
    minimumSensorCoordinateMm: bounds.top,
    maximumSensorCoordinateMm: bounds.bottom,
    focusDistanceM
  }).value;

  const diagonalMm = Math.hypot(
    bounds.right - bounds.left,
    bounds.bottom - bounds.top
  );

  return {
    horizontalDegrees: horizontal.degrees,
    verticalDegrees: vertical.degrees,
    diagonalDegrees: calculateFieldOfView({
      focalLengthMm,
      sensorDimensionMm: diagonalMm,
      focusDistanceM
    }).value.degrees
  };
}

function isPortraitOrientation(orientation: CaptureOrientation): boolean {
  return (
    orientation === "portrait-clockwise" ||
    orientation === "portrait-counter-clockwise"
  );
}

export interface PocSimulationResponse {
  apiVersion: typeof POC_SIMULATION_API_VERSION;
  projection: {
    kind: "focus-aware-thin-lens";
    focusDistanceM: number;
    imageDistanceMm: number;
    infinityProjectionScale: number;
    provenance: CalculationProvenance;
  };
  /**
   * Full-sensor optical field of view before any digital crop.
   */
  fieldOfView: {
    horizontalDegrees: number;
    verticalDegrees: number;
    diagonalDegrees: number;
  };
  sensor: {
    /** Physical imaging-area/native-raster metrics from the shared sensor foundation. */
    geometry: SensorGeometryMetrics;
    /**
     * Backwards-compatible representative pitch used by the current composed
     * POC calculations. This remains the horizontal pitch.
     */
    pixelPitchMicrometers: number;
    pitchXMicrometers: number;
    pitchYMicrometers: number;
    pitchAxisRelativeDifference: number;
  };
  capture?: {
    geometry: ResolvedCaptureGeometry;
    activeFieldOfView: ActiveCaptureFieldOfView;
    outputFieldOfView: OutputFieldOfView;
    focalLength: {
      actualFocalLengthMm: number;
      equivalentFocalLength35Mm: number;
      cropFactor35Mm: number;
      activeImagingAreaDiagonalMm: number;
      basis: "diagonal";
    };
    /**
     * Additional post-output subject framing. This does not mutate physical
     * sensor identity, active capture, or active-capture focal equivalence.
     */
    subjectFraming?: {
      additionalCropFactor: number;
      raster: RasterDimensions;
      megapixels: number;
      subjectHeightFraction: number;
      subjectClipped: boolean;
      additionalCropApplied: boolean;
      retainedImagingArea: SensorImagingArea;
      physicalBoundsFromOpticalAxisMm: PhysicalBoundsFromOpticalAxisMm;
      effectiveFieldOfView: FieldOfViewSummary;
      basis: "centered-output-framing";
    };
    motion: {
      nativeRasterDeltaPixels: RasterVector;
      orientedCaptureDeltaPixels: RasterVector;
      outputDeltaPixels: RasterVector;
    };
    motionSamples?: readonly {
      id: string;
      nativeRasterDeltaPixels: RasterVector;
      orientedCaptureDeltaPixels: RasterVector;
      outputDeltaPixels: RasterVector;
    }[];
    cameraShake?: {
      unstabilized: {
        nativeRasterDeltaPixels: RasterVector;
        orientedCaptureDeltaPixels: RasterVector;
        outputDeltaPixels: RasterVector;
      };
      stabilized: {
        nativeRasterDeltaPixels: RasterVector;
        orientedCaptureDeltaPixels: RasterVector;
        outputDeltaPixels: RasterVector;
      };
    };
  };
  crop: {
    cropFactor: number;
    pixelWidth: number;
    pixelHeight: number;
    megapixels: number;
    retainedAreaFraction: number;
    effectiveFieldOfView: FieldOfViewSummary;
  };
  focusCriterion:
    | {
        source: "explicit";
        circleOfConfusionMm: number;
      }
    | {
        source: "equivalent-viewing-approximation";
        circleOfConfusionMm: number;
        scaleFactor: number;
        provenance: {
          kind: "approximation";
          model: string;
          modelVersion: string;
          assumptions?: readonly string[];
        };
      };
  depthOfField: {
    hyperfocalDistanceM: number;
    nearLimitM: number;
    farLimitM: number | null;
    totalDepthOfFieldM: number | null;
  };
  diffraction: {
    firstZeroDiameterMicrometers: number;
    airyDiameterPixels: number;
    pupilModel: "ideal-circular";
    provenance: CalculationProvenance;
  };
  motion: {
    distanceMm: number;
    distancePixels: number;
    deltaXMm: number;
    deltaYMm: number;
    deltaXPixels: number;
    deltaYPixels: number;
  };
  exposure: {
    ev100: number;
    iso: number;
  };
  subjectSampling?: {
    widthMm: number;
    heightMm: number;
    widthPixels: number;
    heightPixels: number;
  };
  defocusSamples?: readonly {
    id: string;
    distanceM: number;
    diameterMm: number;
    diameterPixels: number;
  }[];
  samplingSamples?: readonly {
    id: string;
    widthMm: number;
    heightMm: number;
    widthPixels: number;
    heightPixels: number;
  }[];
  motionSamples?: readonly {
    id: string;
    distanceMm: number;
    distancePixels: number;
    deltaXMm: number;
    deltaYMm: number;
    deltaXPixels: number;
    deltaYPixels: number;
  }[];
  subjectCrop?: {
    /** Additional crop relative to the already-applied request crop. */
    additionalCropFactor: number;
    /** Total linear crop relative to the full sensor. */
    totalCropFactor: number;
    pixelWidth: number;
    pixelHeight: number;
    megapixels: number;
    subjectHeightFraction: number;
    subjectClipped: boolean;
    additionalCropApplied: boolean;
    effectiveFieldOfView: FieldOfViewSummary;
  };
  apertureShape?: {
    bladeCount: number;
    sunstarRayCount: number;
    sunstarRayAnglesDegrees: readonly number[];
    normalizedVertices: readonly {
      x: number;
      y: number;
    }[];
    provenance: CalculationProvenance;
  };
  primarySubjectDiagnostics?: {
    subjectDistanceM: number;
    samplingHeightPixels: number;
    defocusDiameterPixels: number;
    diffractionFirstZeroDiameterPixels: number;
    diffractionModel: string;
    subjectMotion?: {
      id: string;
      distancePixels: number;
    };
    cameraShake?: {
      stabilizedDistancePixels: number;
      provenanceKind: "approximation";
    };
    comparisonCaution: string;
  };
  cameraShake?: {
    residualMotionFactor: number;
    unstabilized: {
      deltaXmm: number;
      deltaYmm: number;
      distanceMm: number;
      distancePixels: number;
      deltaXPixels: number;
      deltaYPixels: number;
    };
    stabilized: {
      deltaXmm: number;
      deltaYmm: number;
      distanceMm: number;
      distancePixels: number;
      deltaXPixels: number;
      deltaYPixels: number;
    };
    provenance: {
      kind: "approximation";
      model: string;
      modelVersion: string;
      assumptions?: readonly string[];
    };
  };
  provenance: {
    kind: "calculated" | "mixed";
    components: {
      projection: "calculated";
      fieldOfView: "calculated";
      crop: "calculated";
      focusCriterion: "calculated" | "approximation";
      depthOfField: "calculated";
      diffraction: "calculated";
      motion: "calculated";
      exposure: "calculated";
      apertureShape?: "calculated";
      cameraShake?: "approximation";
    };
    note: string;
  };
}

function resolveCaptureVector(
  legacyImagePlaneVector: RasterVector,
  orientation: CaptureOrientation,
  geometry: ResolvedCaptureGeometry
): {
  nativeRasterDeltaPixels: RasterVector;
  orientedCaptureDeltaPixels: RasterVector;
  outputDeltaPixels: RasterVector;
} {
  // Legacy projected-motion/camera-shake components use +X right and +Y up.
  // Capture raster coordinates use +X right and +Y down. Preserve the legacy
  // fields unchanged and convert explicitly before applying physical rotation.
  const nativeRasterDeltaPixels = {
    x: legacyImagePlaneVector.x,
    y: -legacyImagePlaneVector.y
  };
  const orientedCaptureDeltaPixels =
    transformNativeRasterVectorToOriented({
      vector: nativeRasterDeltaPixels,
      orientation
    });
  const scaleX =
    geometry.output.raster.pixelWidth / geometry.output.cropRect.width;
  const scaleY =
    geometry.output.raster.pixelHeight / geometry.output.cropRect.height;

  return {
    nativeRasterDeltaPixels,
    orientedCaptureDeltaPixels,
    outputDeltaPixels: {
      x: orientedCaptureDeltaPixels.x * scaleX,
      y: orientedCaptureDeltaPixels.y * scaleY
    }
  };
}

/**
 * Composes the validated POC calculations into a single renderer/agent-facing
 * response without introducing any new photographic model.
 *
 * @param request Complete POC simulation request with explicit physical units.
 * @returns Serializable POC metrics for one camera/scene configuration.
 */
export function simulatePocCamera(
  request: PocSimulationRequest
): PocSimulationResponse {
  requirePositiveFinite("sensor.widthMm", request.sensor.widthMm);
  requirePositiveFinite("sensor.heightMm", request.sensor.heightMm);

  const sensorGeometry = calculateSensorGeometryMetrics({
    imagingArea: {
      widthMm: request.sensor.widthMm,
      heightMm: request.sensor.heightMm
    },
    nativeRaster: {
      pixelWidth: request.sensor.pixelWidth,
      pixelHeight: request.sensor.pixelHeight
    }
  }).value;
  const pitchXMicrometers = sensorGeometry.sampling.pitchXMicrometers;
  const pitchYMicrometers = sensorGeometry.sampling.pitchYMicrometers;
  const pitchAxisRelativeDifference =
    Math.abs(pitchXMicrometers - pitchYMicrometers) /
    ((pitchXMicrometers + pitchYMicrometers) / 2);

  if (
    pitchAxisRelativeDifference >
    POC_MAX_PITCH_AXIS_RELATIVE_DIFFERENCE
  ) {
    throw new InvalidScientificInputError(
      "The composed POC currently requires approximately square geometric sampling; X/Y pitch differ by more than 1%. Use lower-level axis-aware engine primitives until the POC contract supports separate X/Y sampling."
    );
  }
  const captureGeometry =
    request.capture === undefined
      ? undefined
      : resolveCaptureGeometry({
          imagingArea: {
            widthMm: request.sensor.widthMm,
            heightMm: request.sensor.heightMm
          },
          nativeRaster: {
            pixelWidth: request.sensor.pixelWidth,
            pixelHeight: request.sensor.pixelHeight
          },
          orientation: request.capture.orientation,
          ...(request.capture.activeCaptureRect === undefined
            ? {}
            : { activeCaptureRect: request.capture.activeCaptureRect }),
          ...(request.capture.outputCropRect === undefined
            ? {}
            : { outputCropRect: request.capture.outputCropRect }),
          ...(request.capture.outputRaster === undefined
            ? {}
            : { outputRaster: request.capture.outputRaster })
        }).value;

  requirePositiveFinite("lens.focalLengthMm", request.lens.focalLengthMm);
  requirePositiveFinite("lens.aperture", request.lens.aperture);
  requirePositiveFinite(
    "exposure.shutterSeconds",
    request.exposure.shutterSeconds
  );
  requirePositiveFinite("exposure.iso", request.exposure.iso);
  requirePositiveFinite("focus.focusDistanceM", request.focus.focusDistanceM);

  const hasExplicitCircleOfConfusion =
    request.focus.circleOfConfusionMm !== undefined;
  const hasEquivalentViewingCriterion =
    request.focus.equivalentViewingCircleOfConfusion !== undefined;

  if (hasExplicitCircleOfConfusion === hasEquivalentViewingCriterion) {
    throw new InvalidScientificInputError(
      "Provide exactly one focus circle-of-confusion criterion."
    );
  }

  const equivalentViewingCircleOfConfusion =
    request.focus.equivalentViewingCircleOfConfusion === undefined
      ? undefined
      : estimateEquivalentViewingCircleOfConfusion({
          sensorWidthMm: request.sensor.widthMm,
          sensorHeightMm: request.sensor.heightMm,
          ...request.focus.equivalentViewingCircleOfConfusion
        });

  const circleOfConfusionMm =
    equivalentViewingCircleOfConfusion?.value.circleOfConfusionMm ??
    request.focus.circleOfConfusionMm;

  if (circleOfConfusionMm === undefined) {
    throw new InvalidScientificInputError(
      "A focus circle-of-confusion criterion is required."
    );
  }
  requirePositiveFinite("focus.circleOfConfusionMm", circleOfConfusionMm);
  requirePositiveFinite("crop.factor", request.crop.factor);

  if (request.capture !== undefined && request.crop.factor !== 1) {
    throw new InvalidScientificInputError(
      "capture geometry cannot be combined with legacy crop.factor other than 1."
    );
  }
  if (
    request.capture !== undefined &&
    request.focus.equivalentViewingCircleOfConfusion !== undefined
  ) {
    throw new InvalidScientificInputError(
      "capture geometry currently requires explicit focus.circleOfConfusionMm; equivalent-viewing CoC semantics for retained capture/output area are not yet composed."
    );
  }
  if (request.capture !== undefined && request.subjectCrop !== undefined) {
    throw new InvalidScientificInputError(
      "capture geometry cannot yet be combined with subjectCrop; subject-framing crop semantics must be migrated to the staged output geometry explicitly."
    );
  }

  requirePositiveFinite(
    "diffraction.wavelengthNm",
    request.diffraction.wavelengthNm
  );

  requireUniqueSampleIds("defocusSamples", request.defocusSamples);
  requireUniqueSampleIds("samplingSamples", request.samplingSamples);
  requireUniqueSampleIds("motionSamples", request.motionSamples);

  const projection = calculateThinLensImageDistance({
    focalLengthMm: request.lens.focalLengthMm,
    objectDistanceM: request.focus.focusDistanceM
  });
  const diagonalMm = Math.hypot(
    request.sensor.widthMm,
    request.sensor.heightMm
  );

  const horizontalFov = calculateFieldOfView({
    focalLengthMm: request.lens.focalLengthMm,
    sensorDimensionMm: request.sensor.widthMm,
    focusDistanceM: request.focus.focusDistanceM
  });
  const verticalFov = calculateFieldOfView({
    focalLengthMm: request.lens.focalLengthMm,
    sensorDimensionMm: request.sensor.heightMm,
    focusDistanceM: request.focus.focusDistanceM
  });
  const diagonalFov = calculateFieldOfView({
    focalLengthMm: request.lens.focalLengthMm,
    sensorDimensionMm: diagonalMm,
    focusDistanceM: request.focus.focusDistanceM
  });

  const activeCaptureFieldOfView =
    captureGeometry === undefined || request.capture === undefined
      ? undefined
      : calculateActiveCaptureFieldOfView({
          imagingArea: {
            widthMm: request.sensor.widthMm,
            heightMm: request.sensor.heightMm
          },
          nativeRaster: {
            pixelWidth: request.sensor.pixelWidth,
            pixelHeight: request.sensor.pixelHeight
          },
          orientation: request.capture.orientation,
          ...(request.capture.activeCaptureRect === undefined
            ? {}
            : { activeCaptureRect: request.capture.activeCaptureRect }),
          focalLengthMm: request.lens.focalLengthMm,
          focusDistanceM: request.focus.focusDistanceM
        }).value;
  const equivalentFocalLength =
    captureGeometry === undefined
      ? undefined
      : calculateEquivalentFocalLength35Mm({
          focalLengthMm: request.lens.focalLengthMm,
          activeImagingArea: captureGeometry.activeCapture.imagingArea
        }).value;

  const pixelPitch = calculatePixelPitch({
    sensorWidthMm: request.sensor.widthMm,
    pixelWidth: request.sensor.pixelWidth
  });

  const crop = calculateCenteredCrop({
    pixelWidth: request.sensor.pixelWidth,
    pixelHeight: request.sensor.pixelHeight,
    cropFactor: request.crop.factor
  });
  const cropFieldOfView = calculateCroppedFieldOfView(
    request.sensor.widthMm,
    request.sensor.heightMm,
    request.lens.focalLengthMm,
    request.focus.focusDistanceM,
    request.crop.factor
  );

  const depthOfField = calculateDepthOfField({
    focalLengthMm: request.lens.focalLengthMm,
    aperture: request.lens.aperture,
    focusDistanceM: request.focus.focusDistanceM,
    circleOfConfusionMm
  });

  const diffraction = calculateAiryDisk({
    aperture: request.lens.aperture,
    wavelengthNm: request.diffraction.wavelengthNm
  });

  const motion = calculateProjectedMotionBlur({
    focalLengthMm: request.lens.focalLengthMm,
    shutterSeconds: request.exposure.shutterSeconds,
    positionM: request.motion.positionM,
    velocityMps: request.motion.velocityMps,
    focusDistanceM: request.focus.focusDistanceM,
    pixelPitchMicrometers: pixelPitch.value.micrometers
  });

  const exposureValue = calculateExposureValue100({
    aperture: request.lens.aperture,
    shutterSeconds: request.exposure.shutterSeconds
  });

  const subjectSampling =
    request.subject === undefined
      ? undefined
      : calculateProjectedObjectSize({
          focalLengthMm: request.lens.focalLengthMm,
          objectWidthM: request.subject.widthM,
          objectHeightM: request.subject.heightM,
          distanceM: request.subject.distanceM,
          focusDistanceM: request.focus.focusDistanceM,
          pixelPitchMicrometers: pixelPitch.value.micrometers
        }).value;

  const samplingSamples =
    request.samplingSamples === undefined
      ? undefined
      : request.samplingSamples.map((sample) => {
          const projected = calculateProjectedObjectSize({
            focalLengthMm: request.lens.focalLengthMm,
            objectWidthM: sample.widthM,
            objectHeightM: sample.heightM,
            distanceM: sample.distanceM,
            focusDistanceM: request.focus.focusDistanceM,
            pixelPitchMicrometers: pixelPitch.value.micrometers
          }).value;

          return {
            id: sample.id,
            widthMm: projected.widthMm,
            heightMm: projected.heightMm,
            widthPixels: projected.widthPixels ?? 0,
            heightPixels: projected.heightPixels ?? 0
          };
        });

  const motionSamples =
    request.motionSamples === undefined
      ? undefined
      : request.motionSamples.map((sample) => {
          const projected = calculateProjectedMotionBlur({
            focalLengthMm: request.lens.focalLengthMm,
            shutterSeconds: request.exposure.shutterSeconds,
            positionM: sample.positionM,
            velocityMps: sample.velocityMps,
            focusDistanceM: request.focus.focusDistanceM,
            pixelPitchMicrometers: pixelPitch.value.micrometers
          });

          return {
            id: sample.id,
            distanceMm: projected.value.distanceMm,
            distancePixels: projected.value.distancePixels ?? 0,
            deltaXMm: projected.value.deltaXMm,
            deltaYMm: projected.value.deltaYMm,
            deltaXPixels:
              projected.value.deltaXMm /
              (pixelPitch.value.micrometers / 1000),
            deltaYPixels:
              projected.value.deltaYMm /
              (pixelPitch.value.micrometers / 1000)
          };
        });

  const subjectCrop =
    request.subjectCrop === undefined || subjectSampling === undefined
      ? undefined
      : calculateSubjectFramingCrop({
          pixelWidth: crop.value.pixelWidth,
          pixelHeight: crop.value.pixelHeight,
          subjectHeightPixels: subjectSampling.heightPixels ?? 0,
          targetSubjectHeightFraction:
            request.subjectCrop.targetSubjectHeightFraction
        }).value;

  const totalSubjectCropFactor =
    subjectCrop === undefined
      ? undefined
      : request.crop.factor * subjectCrop.cropFactor;
  const subjectCropFieldOfView =
    totalSubjectCropFactor === undefined
      ? undefined
      : calculateCroppedFieldOfView(
          request.sensor.widthMm,
          request.sensor.heightMm,
          request.lens.focalLengthMm,
          request.focus.focusDistanceM,
          totalSubjectCropFactor
        );

  const cameraShake =
    request.cameraShake === undefined
      ? undefined
      : estimateCameraShakeBlur({
          focalLengthMm: request.lens.focalLengthMm,
          shutterSeconds: request.exposure.shutterSeconds,
          angularVelocityRadPerSec:
            request.cameraShake.angularVelocityRadPerSec,
          stabilizationStopsEquivalent:
            request.cameraShake.stabilizationStopsEquivalent,
          focusDistanceM: request.focus.focusDistanceM,
          pixelPitchMicrometers: pixelPitch.value.micrometers
        });

  const apertureShape =
    request.apertureShape === undefined
      ? undefined
      : calculateIdealApertureGeometry(request.apertureShape);

  const diagnosticSubjectMotion =
    request.diagnostics?.subjectMotionSampleId === undefined
      ? undefined
      : motionSamples?.find(
          (sample) =>
            sample.id === request.diagnostics?.subjectMotionSampleId
        );

  if (
    request.diagnostics?.subjectMotionSampleId !== undefined &&
    diagnosticSubjectMotion === undefined
  ) {
    throw new InvalidScientificInputError(
      `Unknown diagnostics subjectMotionSampleId: ${request.diagnostics.subjectMotionSampleId}`
    );
  }

  const subjectDefocus =
    request.subject === undefined
      ? undefined
      : calculateDefocusCircle({
          focalLengthMm: request.lens.focalLengthMm,
          aperture: request.lens.aperture,
          focusDistanceM: request.focus.focusDistanceM,
          subjectDistanceM: request.subject.distanceM
        }).value;

  const primarySubjectDiagnostics =
    request.subject === undefined ||
    subjectSampling === undefined ||
    subjectDefocus === undefined
      ? undefined
      : {
          subjectDistanceM: request.subject.distanceM,
          samplingHeightPixels: subjectSampling.heightPixels ?? 0,
          defocusDiameterPixels:
            subjectDefocus.diameterMm /
            (pixelPitch.value.micrometers / 1000),
          diffractionFirstZeroDiameterPixels:
            diffraction.value.firstZeroDiameterMicrometers /
            pixelPitch.value.micrometers,
          diffractionModel: diffraction.provenance.model,
          ...(diagnosticSubjectMotion === undefined
            ? {}
            : {
                subjectMotion: {
                  id: diagnosticSubjectMotion.id,
                  distancePixels: diagnosticSubjectMotion.distancePixels
                }
              }),
          ...(cameraShake === undefined
            ? {}
            : {
                cameraShake: {
                  stabilizedDistancePixels:
                    cameraShake.value.stabilized.distancePixels ?? 0,
                  provenanceKind: "approximation" as const
                }
              }),
          comparisonCaution:
            "Sampling, defocus diameter, diffraction diameter, motion path, and camera-shake path are different physical indicators and must not be directly summed into a sharpness score."
        };

  const defocusSamples =
    request.defocusSamples === undefined
      ? undefined
      : request.defocusSamples.map((sample) => {
          requirePositiveFinite(
            "defocusSamples[].distanceM",
            sample.distanceM
          );

          const defocus = calculateDefocusCircle({
            focalLengthMm: request.lens.focalLengthMm,
            aperture: request.lens.aperture,
            focusDistanceM: request.focus.focusDistanceM,
            subjectDistanceM: sample.distanceM
          });

          return {
            id: sample.id,
            distanceM: sample.distanceM,
            diameterMm: defocus.value.diameterMm,
            diameterPixels:
              defocus.value.diameterMm /
              (pixelPitch.value.micrometers / 1000)
          };
        });

  const capture = request.capture;
  const captureMotion =
    captureGeometry === undefined || capture === undefined
      ? undefined
      : resolveCaptureVector(
          {
            x: motion.value.deltaXMm / (pixelPitch.value.micrometers / 1000),
            y: motion.value.deltaYMm / (pixelPitch.value.micrometers / 1000)
          },
          capture.orientation,
          captureGeometry
        );
  const captureMotionSamples =
    captureGeometry === undefined ||
    capture === undefined ||
    motionSamples === undefined
      ? undefined
      : motionSamples.map((sample) => ({
          id: sample.id,
          ...resolveCaptureVector(
            {
              x: sample.deltaXPixels,
              y: sample.deltaYPixels
            },
            capture.orientation,
            captureGeometry
          )
        }));
  const captureCameraShake =
    captureGeometry === undefined ||
    capture === undefined ||
    cameraShake === undefined
      ? undefined
      : {
          unstabilized: resolveCaptureVector(
            {
              x: cameraShake.value.unstabilized.deltaXPixels ?? 0,
              y: cameraShake.value.unstabilized.deltaYPixels ?? 0
            },
            capture.orientation,
            captureGeometry
          ),
          stabilized: resolveCaptureVector(
            {
              x: cameraShake.value.stabilized.deltaXPixels ?? 0,
              y: cameraShake.value.stabilized.deltaYPixels ?? 0
            },
            capture.orientation,
            captureGeometry
          )
        };

  return {
    apiVersion: POC_SIMULATION_API_VERSION,
    projection: {
      kind: "focus-aware-thin-lens",
      focusDistanceM: request.focus.focusDistanceM,
      imageDistanceMm: projection.value.imageDistanceMm,
      infinityProjectionScale: projection.value.infinityProjectionScale,
      provenance: projection.provenance
    },
    fieldOfView: {
      horizontalDegrees: horizontalFov.value.degrees,
      verticalDegrees: verticalFov.value.degrees,
      diagonalDegrees: diagonalFov.value.degrees
    },
    sensor: {
      geometry: sensorGeometry,
      pixelPitchMicrometers: pixelPitch.value.micrometers,
      pitchXMicrometers,
      pitchYMicrometers,
      pitchAxisRelativeDifference
    },
    ...(captureGeometry === undefined ||
    activeCaptureFieldOfView === undefined ||
    equivalentFocalLength === undefined ||
    captureMotion === undefined
      ? {}
      : {
          capture: {
            geometry: captureGeometry,
            activeFieldOfView: activeCaptureFieldOfView,
            focalLength: equivalentFocalLength,
            motion: captureMotion,
            ...(captureMotionSamples === undefined
              ? {}
              : { motionSamples: captureMotionSamples }),
            ...(captureCameraShake === undefined
              ? {}
              : { cameraShake: captureCameraShake })
          }
        }),
    crop: {
      cropFactor: request.crop.factor,
      ...crop.value,
      effectiveFieldOfView: cropFieldOfView
    },
    focusCriterion:
      equivalentViewingCircleOfConfusion === undefined
        ? {
            source: "explicit",
            circleOfConfusionMm
          }
        : {
            source: "equivalent-viewing-approximation",
            circleOfConfusionMm,
            scaleFactor:
              equivalentViewingCircleOfConfusion.value.scaleFactor,
            provenance: {
              kind: "approximation",
              model: equivalentViewingCircleOfConfusion.provenance.model,
              modelVersion:
                equivalentViewingCircleOfConfusion.provenance.modelVersion,
              ...(equivalentViewingCircleOfConfusion.provenance.assumptions ===
              undefined
                ? {}
                : {
                    assumptions:
                      equivalentViewingCircleOfConfusion.provenance.assumptions
                  })
            }
          },
    depthOfField: depthOfField.value,
    diffraction: {
      firstZeroDiameterMicrometers:
        diffraction.value.firstZeroDiameterMicrometers,
      airyDiameterPixels:
        diffraction.value.firstZeroDiameterMicrometers /
        pixelPitch.value.micrometers,
      pupilModel: "ideal-circular",
      provenance: diffraction.provenance
    },
    motion: {
      distanceMm: motion.value.distanceMm,
      distancePixels: motion.value.distancePixels ?? 0,
      deltaXMm: motion.value.deltaXMm,
      deltaYMm: motion.value.deltaYMm,
      deltaXPixels:
        motion.value.deltaXMm / (pixelPitch.value.micrometers / 1000),
      deltaYPixels:
        motion.value.deltaYMm / (pixelPitch.value.micrometers / 1000)
    },
    exposure: {
      ev100: exposureValue.value,
      iso: request.exposure.iso
    },
    ...(subjectSampling === undefined
      ? {}
      : {
          subjectSampling: {
            widthMm: subjectSampling.widthMm,
            heightMm: subjectSampling.heightMm,
            widthPixels: subjectSampling.widthPixels ?? 0,
            heightPixels: subjectSampling.heightPixels ?? 0
          }
        }),
    ...(defocusSamples === undefined ? {} : { defocusSamples }),
    ...(samplingSamples === undefined ? {} : { samplingSamples }),
    ...(motionSamples === undefined ? {} : { motionSamples }),
    ...(subjectCrop === undefined ||
    subjectCropFieldOfView === undefined ||
    totalSubjectCropFactor === undefined
      ? {}
      : {
          subjectCrop: {
            additionalCropFactor: subjectCrop.cropFactor,
            totalCropFactor: totalSubjectCropFactor,
            pixelWidth: subjectCrop.pixelWidth,
            pixelHeight: subjectCrop.pixelHeight,
            megapixels: subjectCrop.megapixels,
            subjectHeightFraction: subjectCrop.subjectHeightFraction,
            subjectClipped: subjectCrop.subjectClipped,
            additionalCropApplied: subjectCrop.cropped,
            effectiveFieldOfView: subjectCropFieldOfView
          }
        }),
    ...(apertureShape === undefined
      ? {}
      : {
          apertureShape: {
            ...apertureShape.value,
            provenance: apertureShape.provenance
          }
        }),
    ...(primarySubjectDiagnostics === undefined
      ? {}
      : { primarySubjectDiagnostics }),
    ...(cameraShake === undefined
      ? {}
      : {
          cameraShake: {
            residualMotionFactor: cameraShake.value.residualMotionFactor,
            unstabilized: {
              deltaXmm: cameraShake.value.unstabilized.deltaXmm,
              deltaYmm: cameraShake.value.unstabilized.deltaYmm,
              distanceMm: cameraShake.value.unstabilized.distanceMm,
              distancePixels:
                cameraShake.value.unstabilized.distancePixels ?? 0,
              deltaXPixels:
                cameraShake.value.unstabilized.deltaXPixels ?? 0,
              deltaYPixels:
                cameraShake.value.unstabilized.deltaYPixels ?? 0
            },
            stabilized: {
              deltaXmm: cameraShake.value.stabilized.deltaXmm,
              deltaYmm: cameraShake.value.stabilized.deltaYmm,
              distanceMm: cameraShake.value.stabilized.distanceMm,
              distancePixels:
                cameraShake.value.stabilized.distancePixels ?? 0,
              deltaXPixels:
                cameraShake.value.stabilized.deltaXPixels ?? 0,
              deltaYPixels:
                cameraShake.value.stabilized.deltaYPixels ?? 0
            },
            provenance: {
              kind: "approximation",
              model: cameraShake.provenance.model,
              modelVersion: cameraShake.provenance.modelVersion,
              ...(cameraShake.provenance.assumptions === undefined
                ? {}
                : { assumptions: cameraShake.provenance.assumptions })
            }
          }
        }),
    provenance: {
      kind:
        equivalentViewingCircleOfConfusion !== undefined ||
        cameraShake !== undefined
          ? "mixed"
          : "calculated",
      components: {
        projection: "calculated",
        fieldOfView: "calculated",
        crop: "calculated",
        focusCriterion:
          equivalentViewingCircleOfConfusion === undefined
            ? "calculated"
            : "approximation",
        depthOfField: "calculated",
        diffraction: "calculated",
        motion: "calculated",
        exposure: "calculated",
        ...(apertureShape === undefined
          ? {}
          : { apertureShape: "calculated" as const }),
        ...(cameraShake === undefined
          ? {}
          : { cameraShake: "approximation" as const })
      },
      note:
        equivalentViewingCircleOfConfusion !== undefined ||
        cameraShake !== undefined
          ? "Mixed provenance: calculated analytical models plus explicitly labeled approximations."
          : "Calculated from Photivra open-engine analytical models."
    }
  };
}
