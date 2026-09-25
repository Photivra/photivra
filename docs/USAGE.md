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

## Image-formation contract

Use the public image-formation contract when coordinating effects that cross optics, motion, sensor, and output domains:

```ts
import { getImageFormationContract } from "@photivra/engine";

const contract = getImageFormationContract();

console.log(contract.domains);
console.log(contract.temporal.authoritativeTimeUnit);
console.log(
  contract.effectPlacements.find(
    (effect) => effect.id === "mechanical-vignetting"
  )
);
```

The contract is descriptive metadata. It does not imply that every reserved stage is implemented, and it does not change the composed POC request/response contract.

Use `requiredUpstreamStages` for hard scientific dependencies and `coupledStages` for shared state/interactions that must not be treated as independent renderer filters.

See [Image-Formation Contract](IMAGE_FORMATION.md) for coordinate, temporal, renderer, and reserved sensor-stage semantics.

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

## Focus-breathing projection

Use `calculateFocusBreathingProjection()` when a caller has an explicit projection-scale value for the selected focus state.

```ts
import {
  calculateFocusBreathingFieldOfView,
  calculateFocusBreathingProjection
} from "@photivra/engine";

const projection = calculateFocusBreathingProjection({
  focalLengthMm: 50,
  focusDistanceM: 1.5,
  breathingProjectionScale: 1.04
});

const horizontalFov = calculateFocusBreathingFieldOfView({
  focalLengthMm: 50,
  focusDistanceM: 1.5,
  sensorDimensionMm: 36,
  breathingProjectionScale: 1.04
});

console.log(projection.value.physicalFocalLengthMm); // still 50
console.log(projection.value.effectiveProjectionDistanceMm);
console.log(horizontalFov.value.effectiveDegrees);
```

`breathingProjectionScale` is dimensionless and applies to the ideal thin-lens projection distance for that one focus state:

- `1` means no additional breathing relative to the current thin-lens model;
- values above `1` narrow framing / increase magnification;
- values below `1` widen framing / reduce magnification.

Photivra does **not** infer this scale from focal length, focus distance, lens identity, sensor format, or marketing specifications. Supplying the same scale at two focus distances means exactly that: the caller explicitly declared the same relative projection scale at both states.

The physical focal length remains authoritative. The effective projection distance is not a renamed focal length and later digital/output crop does not redefine the breathing scale.

This generic model is returned as an `approximation`. A future calibrated lens profile would need defensible provenance, reuse rights, and uncertainty/limitation metadata.

## Radial lens-distortion mapping

Use `calculateRadialDistortionMapping()` for a generic rotationally symmetric ideal-to-distorted image-plane mapping and `calculateInverseRadialDistortionMapping()` for the destination-to-source mapping a renderer needs for inverse sampling.

```ts
import {
  calculateInverseRadialDistortionMapping,
  calculateRadialDistortionMapping
} from "@photivra/engine";

const profile = {
  normalizationRadiusMm: 21.63,
  maximumNormalizedRadius: 1,
  coefficients: {
    k1: -0.08,
    k2: 0.025,
    k3: -0.004
  }
};

const forward = calculateRadialDistortionMapping({
  imagePointMm: { x: 14, y: 8 },
  profile
});

const inverse = calculateInverseRadialDistortionMapping({
  distortedImagePointMm: forward.value.mappedImagePointMm,
  profile
});

console.log(forward.value.radialScale);
console.log(inverse.value.sourceImagePointMm);
```

The model is:

```text
r = image-plane radius / normalizationRadiusMm
scale = 1 + k1 r² + k2 r⁴ + k3 r⁶
p_distorted = p_ideal × scale
```

The coefficients are dimensionless **only together with the declared physical normalization radius**. Reusing coefficients with a different normalization changes the model.

`maximumNormalizedRadius` is the caller-declared valid operating envelope. Photivra analytically checks that radial distance remains strictly monotonic over that interval; profiles that fold over are rejected so inverse mapping is unique.

This first field-mapping slice is radial-only and centered on the optical axis. It does not model tangential/decentered distortion, anamorphic mapping, wavelength dependence, or a calibrated named lens.

The engine returns an `approximation` because the polynomial is a generic caller-parameterized lens model. Test Fixture grid/fiducials can provide renderer regression evidence, but they do not calibrate real-lens coefficients.

## Lateral chromatic-aberration mapping

Use `calculateLateralChromaticAberrationMapping()` to map one ideal image-plane point through a shared **green-reference base distortion** plus red/blue radial coefficient offsets.

Use `calculateInverseLateralChromaticAberrationMapping()` when a renderer needs the ideal source coordinate for each output channel at one distorted destination.

```ts
import {
  calculateInverseLateralChromaticAberrationMapping,
  calculateLateralChromaticAberrationMapping
} from "@photivra/engine";

const profile = {
  normalizationRadiusMm: 21.63,
  maximumNormalizedRadius: 1,
  baseDistortionCoefficients: {
    k1: -0.06,
    k2: 0.018,
    k3: 0
  },
  redCoefficientOffset: {
    k1: 0.02,
    k2: -0.006,
    k3: 0
  },
  blueCoefficientOffset: {
    k1: -0.02,
    k2: 0.006,
    k3: 0
  }
};

const forward = calculateLateralChromaticAberrationMapping({
  imagePointMm: { x: 14, y: 8 },
  profile
});

const inverse = calculateInverseLateralChromaticAberrationMapping({
  distortedImagePointMm: { x: 14, y: 8 },
  profile
});

console.log(forward.value.separation);
console.log(inverse.value.channels.red.sourceImagePointMm);
console.log(inverse.value.channels.green.sourceImagePointMm);
console.log(inverse.value.channels.blue.sourceImagePointMm);
```

This is **field mapping, not a blur kernel**.

The green channel carries the common base geometric distortion. Red and blue offsets are added to that base before mapping. Therefore:

- zero red/blue offsets mean no lateral CA, while base distortion can still exist;
- callers should not apply the same base distortion as a second renderer warp;
- all three combined channel profiles share one physical normalization radius and operating envelope;
- every combined channel profile must remain individually invertible over that envelope.

The channel labels are representative renderer RGB channels. They are not wavelength samples, a spectral lens model, sensor CFA primaries, or a camera colorimetric profile. Longitudinal chromatic aberration and wavelength-dependent PSF behavior remain separate future work.

A renderer should inverse-map each destination channel to the source coordinate returned by the engine instead of adding a backend-specific RGB offset or finished-image fringe blur.

## Illumination vignetting

Use `calculateIlluminationVignetting()` when a generic virtual lens needs field-dependent **relative linear throughput** without changing geometry or pupil/PSF shape.

```ts
import { calculateIlluminationVignetting } from "@photivra/engine";

const illumination = calculateIlluminationVignetting({
  imagePointMm: { x: 16, y: 0 },
  profile: {
    normalizationRadiusMm: 20,
    maximumNormalizedRadius: 1,
    coefficients: {
      r2: -0.5,
      r4: 0.1,
      r6: 0
    }
  }
});

console.log(illumination.value.linearThroughputFactor);
console.log(illumination.value.attenuationStops);
```

The generic radial model is:

```text
rho = image-plane radius / normalizationRadiusMm
T(rho) = 1 + r2*rho² + r4*rho⁴ + r6*rho⁶
```

`T` is a multiplicative **scene-linear/channel-linear** throughput factor. Apply it before display transfer/gamma encoding.

The profile declares `maximumNormalizedRadius`. Photivra analytically checks the complete interval, including internal extrema, and rejects profiles that:

- reach zero or negative throughput; or
- amplify above the optical-axis normalization of `1`.

The output also reports positive attenuation in stops:

```text
attenuationStops = -log2(T)
```

This model changes throughput only. It does not change:

- image-plane coordinates;
- focus;
- pupil shape;
- PSF shape;
- bokeh;
- channel geometry.

Mechanical/pupil vignetting and cat's-eye bokeh belong to the later pupil/PSF foundation. This generic profile is also not calibrated radiometry or a named-lens measurement.

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

## PSF and pupil foundation

Use `getPsfFoundationContract()` to inspect current/reserved PSF contribution ownership and `calculatePsfFoundationComponents()` to evaluate the currently implemented diagnostics in one explicit field/depth/spectral/pupil context.

```ts
import {
  calculatePsfFoundationComponents,
  getPsfFoundationContract
} from "@photivra/engine";

const contract = getPsfFoundationContract();

const components = calculatePsfFoundationComponents({
  focalLengthMm: 85,
  aperture: 2.8,
  focusDistanceM: 10,
  subjectDistanceM: 20,
  fieldPointMm: { x: 12, y: 8 },
  fieldNormalizationRadiusMm: 21.6,
  spectralBasis: {
    kind: "monochromatic",
    wavelengthNm: 550
  }
});

console.log(contract.compositionPolicy);
console.log(components.value.contributions.geometricDefocus);
console.log(components.value.contributions.circularDiffraction);
console.log(components.value.composition.status); // "not-composed"
```

The current foundation intentionally **does not combine** geometric defocus and circular diffraction into a synthetic PSF, MTF, convolution kernel, combined blur radius, or “lens sharpness” score.

It records field position now even though the current defocus/Airy diagnostics are field invariant. Future field-curvature, pupil-clipping, bokeh, and aberration contributions can therefore consume the same context without reinterpreting existing outputs.

The current spectral basis is explicitly monochromatic for the Airy diagnostic. This does not create a spectral lens or sensor-color model.

See [PSF and Pupil Foundation](PSF_FOUNDATION.md).

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

## Spatial camera-rotation mapping

Use `calculateCameraRotationImageMapping()` when you need the image-plane location of a stationary world ray after **pure camera rotation** at an arbitrary physical time from exposure start.

```ts
import { calculateCameraRotationImageMapping } from "@photivra/engine";

const mapped = calculateCameraRotationImageMapping({
  focalLengthMm: 50,
  imagePointMm: { x: 18, y: 12 },
  timeSecondsFromExposureStart: 1 / 60,
  angularVelocityRadPerSec: {
    pitch: 0.01,
    yaw: 0.02,
    roll: 0.005
  },
  samplingPitchMicrometers: {
    x: 6,
    y: 6
  }
});

console.log(mapped.value.mappedImagePointMm);
console.log(mapped.value.deltaMm);
console.log(mapped.value.deltaImagePlaneSamples);
```

Coordinate/sign convention:

- camera axes at exposure start are +X right, +Y up, +Z forward;
- positive pitch/yaw/roll follow the right-hand rule about +X/+Y/+Z;
- the returned image-plane basis is +X right, +Y up;
- a stationary world ray is transformed by the **inverse** camera rotation, so positive physical camera rotation generally moves scene imagery in the opposite screen direction;
- optional `deltaImagePlaneSamples` retains image-plane +Y-up semantics and is **not** a native-raster (+Y-down) vector.

The angular-velocity vector is assumed constant and is integrated as one axis-angle rotation. This avoids arbitrary Euler ordering for simultaneous pitch/yaw/roll.

The function is intentionally rotation-only. Camera translation is excluded because translational optical flow depends on scene depth/parallax.

It is also separate from stabilization. `estimateCameraShakeBlur()` remains the older educational stabilization-equivalent approximation and keeps its existing global-vector semantics for compatibility.

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

## Radiometry readiness

Use `parseRadiometryReadinessProfile()` and `assessRadiometryReadiness()` to validate whether a declared radiometric calibration package contains the prerequisites needed for a future photon estimate.

The gate covers six independently declared requirements:

1. scene spectral radiance or a documented spectral approximation;
2. optical transmission, either spectral data or an explicit T-stop approximation;
3. pupil/vignetting behavior;
4. photosite collection-area semantics;
5. exposure integration;
6. sensor spectral response / quantum efficiency.

Example:

```ts
import {
  assessRadiometryReadiness,
  parseRadiometryReadinessProfile
} from "@photivra/engine";

const profile = parseRadiometryReadinessProfile({
  schemaVersion: "0.1.0",
  components: [
    {
      requirement: "photosite-collection-area",
      scientificStatus: "approximation",
      modelId: "example-collection-area",
      modelVersion: "1.0.0",
      evidence: [
        {
          sourceOrigin: "photivra",
          sourceReference: "photivra:example",
          reuseStatus: "photivra-owned"
        }
      ],
      uncertainty: {
        kind: "not-quantified",
        limitation: "Example only."
      },
      areaModel: "geometric-area-times-fill-factor",
      geometricCellAreaSquareMicrometers: 36,
      fillFactor: 0.8
    }
  ]
});

const readiness = assessRadiometryReadiness(profile);

console.log(readiness.status); // "not-ready"
console.log(readiness.missingRequirements);
console.log(readiness.composedPhotonOutputEnabled); // always false
```

Readiness states are:

- `not-ready`: one or more required prerequisite categories are missing;
- `approximate-only`: every category is present, but at least one component is approximate or has unquantified uncertainty;
- `calibrated-ready`: every category is declared calibrated and carries quantified uncertainty.

A readiness assessment validates the declared structure and provenance metadata. It does not verify that a source or calibration is scientifically correct.

Geometric sample pitch is **not** accepted as photon-collection area by itself. The profile must declare either an effective collection area or a geometric cell area plus explicit fill factor.

Data-bearing spectral/spatial calibration inputs are represented by an artifact ID plus SHA-256 checksum. Photivra does not infer reuse rights from public availability; reusable calibration data requires explicit licensing or Photivra ownership.

The readiness API does not calculate photons, does not change the existing `calculatePhotoelectrons()` primitive, and does not add photon/noise output to `simulatePocCamera()`. Enabling any composed photon model remains a separate future scientific/integration step.

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

POC API 0.20 composes the capture-geometry foundation through final output/viewing semantics. Existing requests remain valid. New callers may supply an optional `capture` object with physical orientation, an optional native active-capture rectangle, an optional oriented output crop, and an optional final output raster.

Capture mode deliberately keeps legacy `crop.factor` separate: it must remain `1` when `capture` is present. Staged capture can use the existing `subjectCrop` request, but the result appears under `capture.subjectFraming` because it is a post-output framing stage rather than a legacy total-crop factor.

Equivalent-viewing CoC in capture mode uses the final retained physical image region, including subject framing when present; changing only output pixel resolution does not change the criterion. Explicit `circleOfConfusionMm` remains unchanged.

The optional response `capture` block exposes resolved geometry, active/output FOV, active-capture diagonal-based 35 mm-equivalent focal length, output sampling scale, optional subject framing, and explicit native-raster/oriented/output motion diagnostics. Legacy motion Y is image-plane +Y-up; capture raster Y is +Y-down, so the conversion is reported rather than hidden. Physical focal length remains authoritative. Sensor-architecture metadata and radiometry-readiness profiles are still standalone.


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

To opt into staged capture geometry:

```ts
const portraitCrop = simulatePocCamera({
  sensor: {
    widthMm: 36,
    heightMm: 24,
    pixelWidth: 6000,
    pixelHeight: 4000
  },
  lens: {
    focalLengthMm: 50,
    aperture: 4
  },
  exposure: {
    shutterSeconds: 1 / 250,
    iso: 100
  },
  focus: {
    focusDistanceM: 10,
    circleOfConfusionMm: 0.03
  },
  crop: {
    factor: 1
  },
  capture: {
    orientation: "portrait-clockwise",
    activeCaptureRect: {
      x: 1500,
      y: 1000,
      width: 3000,
      height: 2000
    },
    outputCropRect: {
      x: 500,
      y: 750,
      width: 1000,
      height: 1500
    },
    outputRaster: {
      pixelWidth: 2000,
      pixelHeight: 3000
    }
  },
  diffraction: {
    wavelengthNm: 550
  },
  motion: {
    positionM: { x: 0, y: 0, z: 10 },
    velocityMps: { x: 1, y: 0, z: 0 }
  }
});

console.log(portraitCrop.capture?.geometry);
console.log(portraitCrop.capture?.activeFieldOfView);
console.log(portraitCrop.capture?.focalLength);
console.log(portraitCrop.capture?.motion.outputDeltaPixels);
```

The focus request must supply exactly one circle-of-confusion criterion: either `circleOfConfusionMm` or `equivalentViewingCircleOfConfusion`. In staged capture mode, the equivalent-viewing approximation uses the final retained physical image region; an explicit `circleOfConfusionMm` remains unchanged by crop/output geometry.

Additional named defocus, sampling, and motion samples can be supplied when a renderer or analysis client needs per-object outputs.

See [Local POC Simulation API](POC_API.md#simulate) for the complete composed request/response semantics. That HTTP transport is repository-only contributor tooling and is not shipped as a package subpath; `simulatePocCamera()` itself is part of the browser-safe root package.
