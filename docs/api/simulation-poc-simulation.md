# simulation/poc-simulation.ts public contracts

Package **1.5.0**, root API **1.5.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## POC_SIMULATION_API_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
POC_SIMULATION_API_VERSION = "0.20.0" as const
```

## PocSimulationRequest

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
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
```

## PocSimulationResponse

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
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
     * Axis-aware pixel-domain mapping from oriented active-capture samples to
     * the declared output raster. Subject framing is a later crop, not another
     * resampling step.
     */
    outputSamplingScale: {
      x: number;
      y: number;
      axisRelativeDifference: number;
    };
    /**
     * Additional post-output subject framing. This does not mutate physical
     * sensor identity, active capture, or active-capture focal equivalence.
     */
    subjectFraming?: CaptureSubjectFraming;
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
        targetBasis: "full-sensor" | "final-retained-output";
        targetImagingArea: SensorImagingArea;
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
```

## simulatePocCamera

Composes the validated POC calculations into a single renderer/agent-facing
response without introducing any new photographic model.

```ts
export function simulatePocCamera(
  request: PocSimulationRequest
): PocSimulationResponse;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.
