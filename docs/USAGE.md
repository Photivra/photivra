# Usage Guide

This guide shows how to call the capabilities exported by the root `@photivra/engine` package.

The package is ESM-only. Primitive scientific calculations generally return a `CalculationResult<T>`:

```ts
const result = calculateSomething(input);

console.log(result.value);
console.log(result.provenance);
console.log(result.quality);
```

`quality` is optional and is omitted when the engine does not have defensible quantified uncertainty/accuracy metadata to report.

## Field of view

Use `calculateFieldOfView()` for one sensor dimension at a time.

```ts
import { calculateFieldOfView } from "@photivra/engine";

const horizontal = calculateFieldOfView({
  focalLengthMm: 50,
  sensorDimensionMm: 36
});

console.log(horizontal.value.degrees);
```

To use the ideal thin-lens sensor plane at a selected focus distance, provide `focusDistanceM`:

```ts
const focused = calculateFieldOfView({
  focalLengthMm: 200,
  sensorDimensionMm: 36,
  focusDistanceM: 22
});

console.log(focused.value.projectionDistanceMm);
console.log(focused.value.degrees);
```

Without `focusDistanceM`, nominal focal length is used as the infinity-focus/pinhole projection distance. Neither mode models real-lens distortion or focus breathing.

For off-center sensor regions, use `calculateFieldOfViewBounds()` with signed sensor-plane coordinates relative to the optical axis:

```ts
import { calculateFieldOfViewBounds } from "@photivra/engine";

const leftHalf = calculateFieldOfViewBounds({
  focalLengthMm: 50,
  minimumSensorCoordinateMm: -18,
  maximumSensorCoordinateMm: 0
});

console.log(leftHalf.value.minimumDegrees);
console.log(leftHalf.value.maximumDegrees);
console.log(leftHalf.value.degrees);
```

Unlike the centered `2 × atan(size / 2d)` form, the bounds API preserves asymmetric angular limits and is used by active-capture geometry for off-center crops.

See [Physics Foundation](PHYSICS_FOUNDATION.md#rectilinear-field-of-view).

## Actual and 35 mm-equivalent focal length

Use `calculateEquivalentFocalLength35Mm()` when you need the conventional diagonal-based 35 mm-equivalent value while preserving the physical optical focal length:

```ts
import { calculateEquivalentFocalLength35Mm } from "@photivra/engine";

const equivalent = calculateEquivalentFocalLength35Mm({
  focalLengthMm: 4.5,
  activeImagingArea: {
    widthMm: 6.17,
    heightMm: 4.55
  }
});

console.log(equivalent.value.actualFocalLengthMm); // 4.5
console.log(equivalent.value.equivalentFocalLength35Mm);
console.log(equivalent.value.basis); // "diagonal"
```

The actual focal length remains the physical optical quantity used by projection and depth-of-field calculations. The equivalent value is derived from the active physical capture diagonal relative to a 36 × 24 mm reference frame.

If an active sensor crop is in use, pass the physical active area resolved by `resolveCaptureGeometry()`. Physical camera orientation does not change the equivalent value because the active diagonal is unchanged.

Focus distance is not part of conventional 35 mm-equivalent focal length. Later digital/output crop and output resolution are also excluded. If a product wants to describe final digital framing, it should label that as output framing rather than silently replacing the optical focal length or capture-equivalent focal length.

`calculateImagingAreaMetrics()` exposes the same canonical diagonal crop-factor calculation independently of raster density so other engine modules do not need to duplicate that formula.

## Thin-lens image distance and magnification

Use `calculateThinLensImageDistance()` to calculate ideal Gaussian thin-lens image distance for an object/focus plane.

```ts
import { calculateThinLensImageDistance } from "@photivra/engine";

const projection = calculateThinLensImageDistance({
  focalLengthMm: 200,
  objectDistanceM: 22
});

console.log(projection.value.imageDistanceMm);
console.log(projection.value.magnification);
console.log(projection.value.infinityProjectionScale);
```

This is a paraxial ideal-lens model. It does not model real-lens focus breathing, pupil magnification, principal-plane movement, or aberrations.

See [Physics Foundation](PHYSICS_FOUNDATION.md#projection-focus-extension-object-size-and-motion).

## Projected object size and sensor sampling

Use `calculateProjectedObjectSize()` for a fronto-parallel object with known physical dimensions and distance.

```ts
import { calculateProjectedObjectSize } from "@photivra/engine";

const subject = calculateProjectedObjectSize({
  focalLengthMm: 200,
  objectWidthM: 0.7,
  objectHeightM: 1.8,
  distanceM: 22,
  focusDistanceM: 22,
  pixelPitchMicrometers: 6
});

console.log(subject.value.widthMm);
console.log(subject.value.heightMm);
console.log(subject.value.widthPixels);
console.log(subject.value.heightPixels);
```

Omit `pixelPitchMicrometers` when only physical image-plane dimensions are needed.

The object plane is assumed to be fronto-parallel to the sensor.

See [Physics Foundation](PHYSICS_FOUNDATION.md#projection-focus-extension-object-size-and-motion).

## Depth of field and defocus

Use `calculateDepthOfField()` for conventional geometric near/far limits:

```ts
import { calculateDepthOfField } from "@photivra/engine";

const dof = calculateDepthOfField({
  focalLengthMm: 85,
  aperture: 2.8,
  focusDistanceM: 10,
  circleOfConfusionMm: 0.03
});

console.log(dof.value.nearLimitM);
console.log(dof.value.farLimitM); // null means infinity
console.log(dof.value.totalDepthOfFieldM);
```

Use `calculateDefocusCircle()` when you need the geometric blur-circle diameter for a specific subject plane:

```ts
import { calculateDefocusCircle } from "@photivra/engine";

const blur = calculateDefocusCircle({
  focalLengthMm: 85,
  aperture: 2.8,
  focusDistanceM: 10,
  subjectDistanceM: 20
});

console.log(blur.value.diameterMm);
```

The circle-of-confusion criterion used for depth-of-field is caller supplied. These are ideal geometric thin-lens models and do not incorporate diffraction or real-lens aberrations into the DOF criterion.

See [Physics Foundation](PHYSICS_FOUNDATION.md#thin-lens-focus-and-depth-of-field).

## Circular-aperture diffraction

Use `calculateAiryDisk()` for the ideal monochromatic circular-pupil first-zero Airy diameter:

```ts
import { calculateAiryDisk } from "@photivra/engine";

const diffraction = calculateAiryDisk({
  aperture: 8,
  wavelengthNm: 550
});

console.log(diffraction.value.firstZeroDiameterMicrometers);
```

This calculation uses `d = 2.44 λ N`. It is not a polygon-aperture diffraction PSF.

See [Physics Foundation](PHYSICS_FOUNDATION.md#diffraction).

## Aperture geometry and sunstar directions

Use `calculateIdealApertureGeometry()` for a regular, straight-edged diaphragm:

```ts
import { calculateIdealApertureGeometry } from "@photivra/engine";

const aperture = calculateIdealApertureGeometry({
  bladeCount: 7,
  firstBladeEdgeAngleDegrees: 15
});

console.log(aperture.value.normalizedVertices);
console.log(aperture.value.sunstarRayCount);
console.log(aperture.value.sunstarRayAnglesDegrees);
```

The output describes normalized aperture geometry and idealized ray-direction symmetry only. It does not calculate diffraction intensity, star length, flare, coatings, or a full PSF.

See [Physics Foundation](PHYSICS_FOUNDATION.md#ideal-diaphragm-geometry-and-sunstar-symmetry).

## Pixel pitch

Use `calculatePixelPitch()` with physical sensor width and horizontal active pixel count:

```ts
import { calculatePixelPitch } from "@photivra/engine";

const pitch = calculatePixelPitch({
  sensorWidthMm: 36,
  pixelWidth: 6000
});

console.log(pitch.value.micrometers);
console.log(pitch.value.millimeters);
```

The current primitive calculates horizontal pixel pitch. It assumes the supplied sensor width and pixel count describe the same active dimension.

See [Physics Foundation](PHYSICS_FOUNDATION.md#pixel-pitch-and-crop).

## Sensor imaging area and native raster

Use `calculateSensorGeometryMetrics()` when physical imaging size and native image resolution need to remain independent:

```ts
import { calculateSensorGeometryMetrics } from "@photivra/engine";

const metrics = calculateSensorGeometryMetrics({
  imagingArea: {
    widthMm: 36,
    heightMm: 24
  },
  nativeRaster: {
    pixelWidth: 6000,
    pixelHeight: 4000
  }
});

console.log(metrics.value.imagingArea.cropFactor35Mm); // 1
console.log(metrics.value.nativeRaster.megapixels); // 24
console.log(metrics.value.sampling.pitchXMicrometers); // 6
console.log(metrics.value.sampling.pitchYMicrometers); // 6
```

`SensorImagingArea` means the physical photosensitive imaging area used for image formation, not sensor package or die dimensions. `NativeImageRaster` is the effective native image-sampling grid; it does not assert a one-to-one relationship between image samples and physical photodiodes/photosites.

The 35 mm crop factor is diagonal-based relative to a 36 × 24 mm reference frame. Changing native raster density does not change the physical crop factor. Changing physical imaging area does not inherently change native megapixels.

The returned X/Y sampling pitches are geometric image-sample spacing. They are not photodiode active area, fill factor, or a photon-collection model and must not be used as those quantities.

The existing `calculatePixelPitch()` API remains available for callers that only need horizontal pitch from sensor width and horizontal pixel count.

## Sensor architecture metadata

Use `parseSensorArchitectureProfile()` for descriptive hardware/capability metadata that crosses an untrusted JSON boundary:

```ts
import { parseSensorArchitectureProfile } from "@photivra/engine";

const architecture = parseSensorArchitectureProfile({
  schemaVersion: "0.2.0",
  illumination: {
    value: "bsi",
    evidence: [
      {
        sourceOrigin: "manufacturer",
        sourceReference: "manufacturer-spec:example",
        reuseStatus: "factual-reference-only"
      }
    ]
  },
  integration: {
    value: "stacked",
    evidence: [
      {
        sourceOrigin: "manufacturer",
        sourceReference: "manufacturer-spec:example",
        reuseStatus: "factual-reference-only"
      }
    ]
  },
  readoutCapabilities: [
    {
      value: "rolling",
      evidence: [
        {
          sourceOrigin: "manufacturer",
          sourceReference: "manufacturer-spec:example",
          reuseStatus: "factual-reference-only"
        }
      ]
    }
  ],
  colorSamplingFamily: {
    value: "bayer",
    evidence: [
      {
        sourceOrigin: "manufacturer",
        sourceReference: "manufacturer-spec:example",
        reuseStatus: "factual-reference-only"
      }
    ]
  }
});
```

The axes are independent. BSI may be stacked or monolithic; stacking does not imply global shutter; and global readout capability does not imply a particular stacking architecture.

Source origin and reuse rights are also independent. Manufacturer or third-party material may be factual-reference-only or explicitly reusable when an appropriate license is present. `photivra-owned` evidence must originate from Photivra. Reusable-data evidence requires an explicit license.

Scalar facts may cite multiple evidence records. Multi-valued capabilities such as rolling/global readout carry evidence independently for each value so one source does not silently support another capability.

`readoutCapabilities` describes hardware capabilities, not the mode selected for one exposure. Capture-specific readout selection and timing belong to later readout/capture-mode models.

Unknown facts should be omitted instead of inferred. Architecture metadata remains descriptive only: BSI, stacking, readout family, and CFA family do not directly change FOV, crop factor, pixel pitch, exposure, noise, or dynamic range. A separate documented downstream physical/calibration model is required before any such effect can be claimed.

## Capture orientation, active area, and output geometry

Use `resolveCaptureGeometry()` to keep physical sensor identity, active capture, physical camera orientation, and final digital output geometry separate:

```ts
import { resolveCaptureGeometry } from "@photivra/engine";

const geometry = resolveCaptureGeometry({
  imagingArea: { widthMm: 36, heightMm: 24 },
  nativeRaster: { pixelWidth: 6000, pixelHeight: 4000 },
  orientation: "portrait-clockwise",
  activeCaptureRect: {
    x: 1000,
    y: 800,
    width: 4000,
    height: 2400
  },
  outputCropRect: {
    x: 0,
    y: 875,
    width: 2400,
    height: 2250
  },
  outputRaster: {
    pixelWidth: 2160,
    pixelHeight: 2025
  }
});

console.log(geometry.value.activeCapture.centerOffsetFromOpticalAxisMm);
console.log(geometry.value.orientedCapture.raster);
console.log(geometry.value.output.raster);
```

Native sensor raster coordinates are invariant under physical camera rotation:

- origin: top-left;
- +X: right;
- +Y: down;
- rectangles: integer, half-open extents `[x, x + width) × [y, y + height)`.

The engine exports exact native↔oriented point, vector, and rectangle transforms for all four physical rotations:

```ts
import {
  transformNativeRasterPointToOriented,
  transformOrientedRasterPointToNative
} from "@photivra/engine";
```

Point transforms use continuous raster-edge coordinates; pixel centers may be represented with +0.5 offsets. Vector transforms rotate direction only. Rectangle transforms preserve integer half-open semantics. Clockwise and counter-clockwise portrait transforms are distinct and round-trip to native coordinates.

`activeCaptureRect` is expressed in native coordinates. The generic model derives physical active-area bounds by assuming native image samples uniformly span the declared physical imaging area. The result exposes physical bounds and center offset relative to the optical axis so off-center crops remain optically asymmetric.

`outputCropRect` is expressed in oriented active-capture coordinates. `outputRaster` may resample that crop but must preserve its aspect ratio within integer-rounding tolerance; implicit geometric stretching is rejected.

Display/file transforms such as EXIF mirroring remain separate from physical `CaptureOrientation`.

Use `calculateActiveCaptureFieldOfView()` for active physical capture FOV. It preserves signed horizontal/vertical bounds for off-center crops and reports both opposite-corner diagonal spans. `diagonalDegrees` is the larger of those spans; centered crops produce equal diagonal spans.

Final digital/output crop is deliberately excluded from active-capture FOV.

## Centered crop and subject framing crop

Use `calculateCenteredCrop()` for a same-aspect centered digital crop:

```ts
import { calculateCenteredCrop } from "@photivra/engine";

const crop = calculateCenteredCrop({
  pixelWidth: 6000,
  pixelHeight: 4000,
  cropFactor: 1.5
});

console.log(crop.value.pixelWidth);
console.log(crop.value.pixelHeight);
console.log(crop.value.megapixels);
console.log(crop.value.retainedAreaFraction);
```

Use `calculateSubjectFramingCrop()` to calculate the additional crop needed for a projected subject to occupy a target fraction of frame height:

```ts
import { calculateSubjectFramingCrop } from "@photivra/engine";

const framing = calculateSubjectFramingCrop({
  pixelWidth: 6000,
  pixelHeight: 4000,
  subjectHeightPixels: 1200,
  targetSubjectHeightFraction: 0.5
});

console.log(framing.value.cropFactor);
console.log(framing.value.subjectHeightFraction);
console.log(framing.value.subjectClipped);
```

Subject framing assumes the crop can be positioned around the subject; it does not check the subject's actual position against image edges.

See [Physics Foundation](PHYSICS_FOUNDATION.md#pixel-pitch-and-crop).

## Projected subject motion

Use `calculateProjectedMotionBlur()` for representative-point image-plane displacement during an exposure:

```ts
import { calculateProjectedMotionBlur } from "@photivra/engine";

const motion = calculateProjectedMotionBlur({
  focalLengthMm: 200,
  shutterSeconds: 1 / 500,
  positionM: { x: 0.5, y: 1.2, z: 22 },
  velocityMps: { x: 8, y: 0, z: 0 },
  focusDistanceM: 22,
  pixelPitchMicrometers: 6
});

console.log(motion.value.deltaXMm);
console.log(motion.value.deltaYMm);
console.log(motion.value.distanceMm);
console.log(motion.value.distancePixels);
```

The model assumes constant world-space linear velocity. It tracks a representative point rather than extended-object scale blur, rotation, deformation, or acceleration.

See [Motion and Signal Foundation](MOTION_AND_SIGNAL.md#projected-subject-motion).

## Exposure and ISO relations

Use `calculateExposureValue100()` for EV100:

```ts
import { calculateExposureValue100 } from "@photivra/engine";

const ev = calculateExposureValue100({
  aperture: 8,
  shutterSeconds: 1 / 125
});

console.log(ev.value);
```

Use `calculateRelativeOpticalExposure()` to compare aperture/shutter combinations:

```ts
import { calculateRelativeOpticalExposure } from "@photivra/engine";

const exposure = calculateRelativeOpticalExposure({
  aperture: 4,
  shutterSeconds: 1 / 250,
  referenceAperture: 5.6,
  referenceShutterSeconds: 1 / 125
});

console.log(exposure.value.factor);
console.log(exposure.value.stops);
```

Use `calculateRelativeRenderedExposure()` when a renderer needs a nominal linear brightness multiplier that combines the aperture/shutter optical-exposure change with ISO gain relative to declared reference settings:

```ts
import { calculateRelativeRenderedExposure } from "@photivra/engine";

const rendered = calculateRelativeRenderedExposure({
  aperture: 5.6,
  shutterSeconds: 1 / 2000,
  iso: 1600,
  referenceAperture: 5.6,
  referenceShutterSeconds: 1 / 1000,
  referenceIso: 800
});

console.log(rendered.value.factor); // 1
console.log(rendered.value.stops); // 0
console.log(rendered.value.opticalFactor); // 0.5
console.log(rendered.value.isoGainFactor); // 2
```

This is a relative rendering relation, not a radiometric sensor model. ISO is treated as nominal rendering gain; it does not create photons, and the function does not model clipping, tone mapping, lens transmission, or sensor-specific noise behavior.

Use `calculateEquivalentIso()` to calculate the nominal ISO/gain compensation needed to preserve rendered exposure:

```ts
import { calculateEquivalentIso } from "@photivra/engine";

const iso = calculateEquivalentIso({
  baseIso: 400,
  baseAperture: 4,
  baseShutterSeconds: 1 / 500,
  aperture: 5.6,
  shutterSeconds: 1 / 500
});

console.log(iso.value);
```

These relations do not model scene radiance, lens T-stop/transmission, vignetting, or sensor-specific gain/noise behavior.

See [Motion and Signal Foundation](MOTION_AND_SIGNAL.md#exposure-relations).

## Camera shake and stabilization-equivalent approximation

Use `estimateCameraShakeBlur()` with a controlled yaw/pitch angular-velocity profile:

```ts
import { estimateCameraShakeBlur } from "@photivra/engine";

const shake = estimateCameraShakeBlur({
  focalLengthMm: 200,
  shutterSeconds: 1 / 60,
  angularVelocityRadPerSec: {
    yaw: 0.002,
    pitch: 0.001
  },
  stabilizationStopsEquivalent: 3,
  focusDistanceM: 22,
  pixelPitchMicrometers: 6
});

console.log(shake.value.unstabilized.distancePixels);
console.log(shake.value.stabilized.distancePixels);
console.log(shake.value.residualMotionFactor);
console.log(shake.provenance.kind); // "approximation"
```

The `2^-stops` attenuation is an educational approximation, not a real IBIS/OIS or CIPA rating. The current output is one global image-plane vector rather than spatially varying rotational optical flow.

See [Camera Shake and Stabilization](STABILIZATION.md).

## Photoelectron and SNR primitives

Use `calculatePhotoelectrons()` only when you already have a defensible mean incident photon count and quantum efficiency:

```ts
import { calculatePhotoelectrons } from "@photivra/engine";

const electrons = calculatePhotoelectrons({
  incidentPhotons: 10_000,
  quantumEfficiency: 0.7
});

console.log(electrons.value);
```

Use `calculateSignalToNoise()` for the basic Poisson-shot-noise plus independent RMS read-noise model:

```ts
import { calculateSignalToNoise } from "@photivra/engine";

const snr = calculateSignalToNoise({
  signalElectrons: 7000,
  readNoiseElectrons: 3
});

console.log(snr.value.shotNoiseStdElectrons);
console.log(snr.value.combinedNoiseStdElectrons);
console.log(snr.value.snrLinear);
console.log(snr.value.snrDb);
```

These primitives do not derive photons from scene imagery and do not model a complete commercial sensor pipeline.

See [Motion and Signal Foundation](MOTION_AND_SIGNAL.md#signalnoise-primitives).

## Camera and scene schema validation

Use the runtime parsers when camera or scene data crosses an untrusted JSON boundary.

```ts
import {
  parseCameraConfiguration,
  parseSceneDefinition
} from "@photivra/engine";

const camera = parseCameraConfiguration(JSON.parse(cameraJson));
const scene = parseSceneDefinition(JSON.parse(sceneJson));
```

The parsers throw `InvalidConfigurationError` when the supplied structure or supported values are invalid.

Example camera shape:

```ts
const camera = parseCameraConfiguration({
  sensor: {
    widthMm: 36,
    heightMm: 24,
    pixelWidth: 6000,
    pixelHeight: 4000
  },
  lens: {
    focalLengthMm: 50,
    aperture: 2.8
  },
  exposure: {
    shutterSeconds: 1 / 250,
    iso: 400
  },
  focus: {
    focusDistanceM: 10
  },
  stabilization: {
    bodyEnabled: true,
    lensEnabled: false,
    support: "handheld"
  }
});
```

See [Validation boundaries in the README](../README.md#validation-boundaries) and [Architecture](ARCHITECTURE.md).

## Provenance, uncertainty, and quality metadata

Primitive scientific calculations return model provenance alongside the value:

```ts
import { calculateFieldOfView } from "@photivra/engine";

const result = calculateFieldOfView({
  focalLengthMm: 50,
  sensorDimensionMm: 36
});

console.log(result.provenance.kind);
console.log(result.provenance.model);
console.log(result.provenance.modelVersion);
console.log(result.provenance.assumptions);
```

For code that defines a new scientific result, the package exports helpers such as `calculatedResult()`, `approximationResult()`, `estimatedResult()`, and `calibratedResult()`.

```ts
import { calculatedResult } from "@photivra/engine";

const result = calculatedResult(
  { distanceM: 10 },
  "example-model",
  "1.0.0",
  ["Example assumption"],
  {
    uncertainty: [
      {
        kind: "absolute",
        quantityPath: "value.distanceM",
        source: "measurement",
        plusMinus: 0.1,
        unit: "m"
      }
    ]
  }
);
```

Do not invent uncertainty values. Quality metadata should only be supplied when the uncertainty, calibration, valid range, or quality note has a defensible basis.

See [Scientific and Source Provenance](PROVENANCE.md) and [Public API Style](API_STYLE.md#result-metadata).

## Composed POC simulation

Use `simulatePocCamera()` when you want one composed response containing the current POC calculations.

The root engine and composed POC are versioned independently. `ENGINE_API_VERSION` describes the root library surface; `POC_SIMULATION_API_VERSION` describes this composed request/response contract.

The current composed POC reports X/Y geometric sample pitch but still uses one backwards-compatible representative horizontal pitch internally for blur/sampling calculations. It therefore rejects sensor geometry whose X/Y pitch differs by more than 1%. Axis-aware lower-level geometry remains available for more general sensor layouts.


```ts
import { simulatePocCamera } from "@photivra/engine";

const simulation = simulatePocCamera({
  sensor: {
    widthMm: 36,
    heightMm: 24,
    pixelWidth: 6000,
    pixelHeight: 4000
  },
  lens: {
    focalLengthMm: 200,
    aperture: 5.6
  },
  exposure: {
    shutterSeconds: 1 / 1000,
    iso: 800
  },
  focus: {
    focusDistanceM: 22,
    circleOfConfusionMm: 0.03
  },
  crop: {
    factor: 1
  },
  diffraction: {
    wavelengthNm: 550
  },
  motion: {
    positionM: { x: 0.2, y: 1.2, z: 21.8 },
    velocityMps: { x: 35, y: 0, z: 0 }
  },
  subject: {
    widthM: 0.7,
    heightM: 1.8,
    distanceM: 22
  },
  subjectCrop: {
    targetSubjectHeightFraction: 0.5
  },
  cameraShake: {
    angularVelocityRadPerSec: {
      yaw: 0.002,
      pitch: 0.001
    },
    stabilizationStopsEquivalent: 2
  },
  apertureShape: {
    bladeCount: 7,
    firstBladeEdgeAngleDegrees: 0
  }
});

console.log(simulation.apiVersion);
console.log(simulation.fieldOfView);
console.log(simulation.depthOfField);
console.log(simulation.motion);
console.log(simulation.provenance);
```

The focus request must supply exactly one circle-of-confusion criterion: either `circleOfConfusionMm` or `equivalentViewingCircleOfConfusion`.

Additional named defocus, sampling, and motion samples can be supplied when a renderer or analysis client needs per-object outputs.

See [Local POC Simulation API](POC_API.md#simulate) for the complete composed request/response semantics. That HTTP transport is repository-only contributor tooling and is not shipped as a package subpath; `simulatePocCamera()` itself is part of the browser-safe root package.
