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

## Oriented raster to image-plane coordinates

Use the coordinate bridge before calling image-plane lens or camera-mapping APIs
from an oriented/output renderer. The capture/output physical region uses the
raster-style +Y-down basis, while lens-field APIs use the pre-orientation
optical image plane with +Y up.

```ts
import {
  mapImagePlanePointToOrientedPhysicalUv,
  mapOrientedPhysicalUvToImagePlanePoint
} from "@photivra/engine";

const bounds = { left: -12, right: 12, top: -18, bottom: 18 };

const destination = mapOrientedPhysicalUvToImagePlanePoint({
  uv: { u: 0.25, v: 0.75 },
  orientedPhysicalBoundsFromOpticalAxisMm: bounds,
  orientation: "portrait-clockwise"
});

const roundTrip = mapImagePlanePointToOrientedPhysicalUv({
  imagePlanePointMm: destination,
  orientedPhysicalBoundsFromOpticalAxisMm: bounds,
  orientation: "portrait-clockwise"
});
```

These functions only transform coordinate bases. They do not apply projection,
distortion, focus breathing, crop, or resampling. Asymmetric/off-axis physical
bounds are preserved rather than recentered, and reverse mapping fails closed
when the image-plane point lies outside the supplied physical region.

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

`maximumNormalizedRadius` is the caller-declared valid operating envelope. Photivra analytically checks that radial distance remains strictly monotonic over that interval, including near-linear higher-order coefficient cases; profiles that fold over are rejected so inverse mapping is unique. Derived normalized radii must remain finite, and malformed runtime point/batch inputs fail closed rather than entering the inverse solver.

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

For renderer grids or other multi-point evaluation, use the batch inverse APIs so
one profile validation/provenance boundary serves the full point set:

```ts
import {
  calculateInverseLateralChromaticAberrationMappings,
  calculateInverseRadialDistortionMappings
} from "@photivra/engine";

const radialGrid = calculateInverseRadialDistortionMappings({
  distortedImagePointsMm: points,
  profile: radialProfile
});

const caGrid = calculateInverseLateralChromaticAberrationMappings({
  distortedImagePointsMm: points,
  profile: caProfile
});
```

Batch per-point values are defined to match the corresponding scalar inverse
APIs. Batching changes repeated validation/allocation structure, not the lens
model, operating envelope, coordinate basis, or numerical solver.

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

See [Physics Foundation](PHYSICS_FOUNDATION.md#sensor-geometry-sampling-capture-and-crop).

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

`readoutCapabilities` describes hardware capabilities, not the mode selected for one exposure. The capture-mode profile can declare that a selected mode needs mode-specific readout timing, while the actual timing values remain owned by the separate readout-timing contract.

Unknown facts should be omitted instead of inferred. Architecture metadata remains descriptive only: BSI, stacking, readout family, and CFA family do not directly change FOV, crop factor, pixel pitch, exposure, noise, or dynamic range. A separate documented downstream physical/calibration model is required before any such effect can be claimed.

## Color-sampling topology

Use `parseSensorColorSamplingProfile()` when an exact color-sampling topology is known independently from descriptive sensor-family metadata:

```ts
import {
  parseSensorColorSamplingProfile,
  resolveColorSamplingSite
} from "@photivra/engine";

const topology = parseSensorColorSamplingProfile({
  schemaVersion: "0.1.0",
  profileId: "example-periodic-layout",
  evidence: [
    {
      sourceOrigin: "photivra",
      sourceReference: "example:periodic-layout",
      reuseStatus: "photivra-owned"
    }
  ],
  coordinateSystem:
    "native-sensor-color-sampling-site-index",
  layout: {
    kind: "periodic-mosaic",
    repeatWidthSites: 2,
    repeatHeightSites: 2,
    siteChannelIds: [
      "red-like",
      "green-a",
      "green-b",
      "blue-like"
    ],
    anchor: "native-sensor-top-left-site"
  }
});

const site = resolveColorSamplingSite({
  profile: topology,
  site: { x: 5, y: 8 }
});

console.log(site.mapping);
```

The topology coordinate system is a distinct **native sensor color-sampling-site lattice**:

- zero-based integer site indices;
- origin at the native sensor's top-left sampling site;
- +X right and +Y down;
- periodic phase anchored to absolute sensor-site indices.

It is intentionally **not** `NativeImageRaster`. The existing native image raster is an effective image-sampling grid and does not guarantee one sample per physical photodiode or one sample per color-filter site. A later explicit binding must establish how a selected capture mode's effective raster maps to this topology before RAW/CFA sampling can be simulated.

That distinction also protects crop phase. If an active crop begins part-way through a repeating tile, callers must preserve the original absolute native site indices. Crop-local `(0,0)` must not silently become a new CFA origin.

`siteChannelIds` are semantic measurement-channel identifiers only. Names such as `red-like`, `green-a`, or `clear` do not establish:

- wavelength response;
- quantum efficiency;
- spectral sensitivity;
- colorimetric primaries;
- white balance behavior;
- calibrated sensor response.

Those belong to later spectral/radiometric contracts.

The periodic layout is generic. It can represent a 2×2 Bayer-like phase, larger repeating mosaics, grouped-color tiles, RGBW-like layouts, or other periodic channel arrangements without adding a manufacturer-specific layout enum. Distinct green positions can use the same channel ID or separate IDs when later calibration requires them to remain distinct.

The exact topology is also separate from `SensorArchitectureProfile.colorSamplingFamily`. A family such as `bayer`, `quad-bayer`, `custom-rgb-mosaic`, or `layered-color` is descriptive metadata; Photivra never invents an exact repeating tile from that family label.

Monochrome is represented separately with one semantic measurement-channel ID and no spatial mosaic.

Layered color is deliberately **structural-only** in schema 0.1.0 and uses a separate unresolved spatial-reference marker rather than pretending it shares the periodic site lattice:

```ts
const layered = parseSensorColorSamplingProfile({
  schemaVersion: "0.1.0",
  profileId: "example-layered",
  evidence: [
    {
      sourceOrigin: "photivra",
      sourceReference: "example:layered",
      reuseStatus: "photivra-owned"
    }
  ],
  coordinateSystem:
    "native-sensor-layered-spatial-relationship-not-resolved",
  layout: {
    kind: "layered",
    layerChannelIds: [
      "layer-a",
      "layer-b",
      "layer-c"
    ],
    spatialSamplingRelationship: "not-resolved"
  }
});
```

The engine does not expose per-site layered resolution yet. Real layered designs can use unequal per-layer spatial density or registration, so assuming one coincident equal-resolution RGB triplet at every site would be scientifically unsafe.

Schema 0.1.0 also does not model sparse exceptions to an otherwise periodic layout, such as phase-detect sites, masked sites, sensor defects, or other non-periodic overrides.

Physical orientation remains downstream. The native topology is not rotated or re-phased merely because the camera is held vertically. Likewise, changing CFA topology does not change physical imaging area, crop factor, FOV, or output geometry.

## Capture-mode/color-sampling binding

Use `parseNativeEffectiveRasterColorSamplingBindingProfile()` when evidence establishes how one exact canonical `NativeImageRaster` relates to the separate native color-sampling-site lattice.

The first binding is deliberately regular and sensor-anchored:

```ts
import {
  parseNativeEffectiveRasterColorSamplingBindingProfile,
  resolveNativeEffectiveRasterColorSamplingBinding
} from "@photivra/engine";

const binding = parseNativeEffectiveRasterColorSamplingBindingProfile({
  schemaVersion: "0.1.0",
  bindingId: "example-native-to-cfa",
  colorSamplingProfileId: "example-periodic-layout",
  nativeRaster: {
    pixelWidth: 6000,
    pixelHeight: 4000
  },
  evidence: [
    {
      sourceOrigin: "photivra",
      sourceReference: "example:native-to-cfa-binding",
      reuseStatus: "photivra-owned"
    }
  ],
  relationship: {
    kind: "regular-native-effective-sample-blocks",
    sitesPerNativeSampleX: 1,
    sitesPerNativeSampleY: 1,
    anchor: "shared-native-top-left"
  }
});

const resolvedBinding =
  resolveNativeEffectiveRasterColorSamplingBinding({
    nativeRaster: {
      pixelWidth: 6000,
      pixelHeight: 4000
    },
    colorSamplingProfile: topology,
    bindingProfile: binding
  });
```

A `1 × 1` relationship is still an **asserted/evidenced binding**. Matching dimensions, matching aspect ratio, output megapixels, or a family label such as Bayer never prove that one `NativeImageRaster` sample corresponds to one color-sampling site.

The binding applies only to the exact native raster dimensions recorded in the profile. The first schema supports one native effective sample mapping to a regular rectangular block of color-sampling sites with a shared native top-left anchor. Irregular site relationships require a later explicit mapping.

To compose that sensor-level relationship with a capture mode, use `resolveCaptureModeColorSamplingContributors()`:

```ts
import {
  resolveCaptureModeColorSamplingContributors
} from "@photivra/engine";

const sources =
  resolveCaptureModeColorSamplingContributors({
    nativeRaster: {
      pixelWidth: 6000,
      pixelHeight: 4000
    },
    captureModeProfile: modes,
    modeId: "grouped",
    colorSamplingProfile: topology,
    bindingProfile: binding,
    modeSampleIndexFullFrame: {
      x: 10,
      y: 20
    },
    groupedSamplingAnchor: {
      anchor: "native-effective-raster-top-left",
      evidence: [
        {
          sourceOrigin: "photivra",
          sourceReference: "example:group-phase",
          reuseStatus: "photivra-owned"
        }
      ]
    }
  });

console.log(sources.colorSamplingSiteRect);
console.log(sources.channelSiteCounts);
console.log(sources.channelComposition);
```

`modeSampleIndexFullFrame` is always expressed in the selected mode's **full-frame per-frame effective sampling raster**. The API intentionally does not accept crop-local coordinates. If an active crop starts away from the native origin, a caller must preserve or recover the absolute full-frame mode index before resolving CFA structure. This prevents active crops from silently re-phasing the mosaic.

For `grouped-native-samples` modes, group width/height alone do not prove group phase. The caller must separately provide evidence that the groups are anchored at the native effective raster top-left. A future contract can add other explicitly evidenced group phases if required.

The result is a compact **pre-reconstruction structural source region**:

- `nativeEffectiveSampleRect` identifies the absolute native effective samples structurally associated with the mode sample;
- `colorSamplingSiteRect` identifies the corresponding absolute color-site rectangle;
- `channelSiteCounts` gives exact counts per semantic channel for monochrome/periodic topology;
- `channelComposition` reports whether the structural region contains one channel or multiple channels.

The bridge does **not** enumerate every contributing site. It also does not establish sum/average weights, spectral response, photon/electron values, or a complete downstream reconstructed-pixel dependency graph.

A mixed-channel region therefore remains mixed. Photivra does not collapse a red/green/blue structural region into one synthetic CFA channel merely because a capture mode groups those native effective samples. `combinationDomain` from the capture mode remains separate from any unimplemented weighting/combination equation.

`declared-effective-raster` modes fail closed even when their dimensions happen to match the native raster. Their relationship was intentionally declared non-simple in #13 and therefore needs a mode-specific color-site mapping rather than dimension inference.

Layered-color topology also remains unbound because schema 0.1.0 does not yet define per-layer spatial density/registration.

Pixel-shift/sensor-shift metadata is preserved but does not change CFA assignment. The sensor and its filters move together relative to the optical image; the optical-registration effect of that shift belongs to a later image-formation contract.

## Sensor optical stack

Use `parseSensorOpticalStackProfile()` for evidence-backed physical stack metadata and a separately declared **effective anti-aliasing spatial response**:

```ts
import {
  parseSensorOpticalStackProfile,
  resolveAntiAliasingSpatialKernel
} from "@photivra/engine";

const stack = parseSensorOpticalStackProfile({
  schemaVersion: "0.1.0",
  profileId: "example-stack",
  evidence: [
    {
      sourceOrigin: "photivra",
      sourceReference: "example:stack",
      reuseStatus: "photivra-owned"
    }
  ],
  orderedComponents: [
    {
      componentId: "front-pack",
      roles: [
        "cover-glass",
        "infrared-cut",
        "anti-reflection"
      ],
      evidence: [
        {
          sourceOrigin: "photivra",
          sourceReference: "example:front-pack",
          reuseStatus: "photivra-owned"
        }
      ]
    }
  ],
  effectiveAntiAliasingSpatialResponse: {
    kind: "normalized-point-splitting-kernel",
    evidence: [
      {
        sourceOrigin: "photivra",
        sourceReference: "example:aa-kernel",
        reuseStatus: "photivra-owned"
      }
    ],
    coordinateSystem: "native-sensor-physical",
    scope:
      "field-wavelength-polarization-invariant-approximation",
    components: [
      {
        offsetMicrometers: { x: -1, y: 0 },
        normalizedWeight: 0.5
      },
      {
        offsetMicrometers: { x: 1, y: 0 },
        normalizedWeight: 0.5
      }
    ]
  },
  microlens: {
    presence: "present",
    evidence: [
      {
        sourceOrigin: "photivra",
        sourceReference: "example:microlens-presence",
        reuseStatus: "photivra-owned"
      }
    ],
    opticalEffectModel: "unresolved"
  }
});

const aaKernel =
  resolveAntiAliasingSpatialKernel(stack);

console.log(aaKernel.components);
```

The physical component list and effective AA response are intentionally separate. A stack may contain birefringent/retarder elements while the net intentional low-pass response is cancelled or otherwise effectively absent.

`effectiveAntiAliasingSpatialResponse` has three first-stage states:

- omitted — **unknown/unasserted**;
- `kind: "absent"` — evidence says this model should add no intentional AA spatial-splitting term;
- `kind: "present-unresolved"` — an AA effect exists but its spatial response is not defensibly known;
- `kind: "normalized-point-splitting-kernel"` — the caller explicitly supplies a normalized spatial point-splitting approximation.

Unknown and absent are not interchangeable. Likewise, `absent` does **not** mean the complete sensor stack has an identity PSF, and it does not mean aliasing or moiré are impossible. Lens PSF, cover/filter behavior, microlenses, sampling topology, and scene detail still matter.

The point-splitting kernel is deliberately generic:

- component count is arbitrary rather than fixed to four rays;
- offsets are in micrometres in `native-sensor-physical` coordinates (+X right, +Y down);
- physical camera orientation does not rotate/redefine the stored kernel;
- normalized weights must sum to one;
- the weights describe **spatial redistribution only**.

They do not represent total optical throughput, spectral transmission, photon efficiency, QE, or fill factor. Those belong to separate radiometric/sensor-response contracts.

The first point-splitting scope is explicitly `field-wavelength-polarization-invariant-approximation`. Real OLPF behavior may depend on wavelength, incidence angle/field position, polarization, materials, and stack geometry. Do not upgrade this generic kernel into a calibrated whole-stack PSF.

`orderedComponents` is incident-light → sensor descriptive metadata. Component roles can include cover glass, IR/UV filtering, AR treatment, birefringent low-pass elements, wave plates, and other optical filters. Schema 0.1.0 does not derive transmission, refractive focus shift, aberration, thickness effects, or a spectral response from those roles.

Microlens presence or absence is also descriptive only. A `present` microlens does not by itself specify angular acceptance, spatial concentration, fill factor, crosstalk, QE improvement, or field behavior.

The resolver therefore returns only the **effective AA spatial kernel** and explicitly reports that cover/filter effects, microlens response, throughput, spectral transmission, field dependence, wavelength dependence, and polarization dependence are not included.

## Sensor sampling aperture

Use `parseSensorSamplingApertureProfile()` and `resolveSensorSamplingAperture()` when the physical color-site lattice registration and a geometric photosensitive-region approximation are known:

```ts
import {
  parseSensorSamplingApertureProfile,
  resolveSensorSamplingAperture
} from "@photivra/engine";

const sampling = parseSensorSamplingApertureProfile({
  schemaVersion: "0.1.0",
  profileId: "example-sampling-aperture",
  colorSamplingProfileId: "example-periodic-layout",
  colorSamplingBindingId: "example-native-to-cfa",
  evidence: [
    {
      sourceOrigin: "photivra",
      sourceReference: "example:sampling-aperture",
      reuseStatus: "photivra-owned"
    }
  ],
  siteCenterLattice: {
    kind: "regular-rectangular-site-center-lattice",
    coordinateSystem: "native-sensor-physical",
    pitchXMicrometers: 6,
    pitchYMicrometers: 6,
    firstSiteCenterFromImagingAreaTopLeftMicrometers: {
      x: 3,
      y: 3
    },
    evidence: [
      {
        sourceOrigin: "photivra",
        sourceReference: "example:site-registration",
        reuseStatus: "photivra-owned"
      }
    ]
  },
  geometricSensitiveAperture: {
    kind: "uniform-axis-aligned-rectangle",
    widthMicrometers: 5,
    heightMicrometers: 5,
    centerOffsetFromSiteCenterMicrometers: {
      x: 0,
      y: 0
    },
    evidence: [
      {
        sourceOrigin: "photivra",
        sourceReference: "example:sensitive-region",
        reuseStatus: "photivra-owned"
      }
    ]
  }
});

const siteAperture = resolveSensorSamplingAperture({
  imagingArea: {
    widthMm: 36,
    heightMm: 24
  },
  nativeRaster: {
    pixelWidth: 6000,
    pixelHeight: 4000
  },
  colorSamplingProfile: topology,
  colorSamplingBindingProfile: binding,
  samplingApertureProfile: sampling,
  site: { x: 100, y: 200 }
});

console.log(
  siteAperture.geometricSensitiveAperture
    .boundsFromOpticalAxisMm
);
```

The site-center lattice is a distinct physical registration contract:

- coordinates are `native-sensor-physical`: optical-axis origin, +X right, +Y down;
- `pitchXMicrometers` and `pitchYMicrometers` are explicit evidence-backed site-center spacings;
- the first site's center is explicitly registered relative to the physical imaging area's top-left edge;
- the full declared lattice must fit inside the supplied physical imaging area.

Photivra does **not** derive this site pitch or origin from `NativeImageRaster`. The native effective raster and the color-site lattice already have a structural binding, but physical placement remains a separate fact.

The geometric sensitive aperture is separate from site pitch. A scalar fill fraction is not sufficient to reconstruct shape or centering, so schema 0.1.0 stores explicit rectangle dimensions and center offset.

The first resolved footprint is deliberately narrow:

- uniform axis-aligned rectangle;
- contained within one regular lattice cell;
- no neighboring geometric-aperture overlap in this model;
- normalized spatial weighting is a unit-area average;
- physical aperture area is reported separately.

The engine also derives `geometricSensitiveAreaFractionOfLatticeCell`:

```text
geometric sensitive rectangle area
----------------------------------
nominal site lattice cell area
```

This is a **geometry diagnostic**, not a calibrated sensitivity result. It does not establish QE, effective radiometric collection area, photon conversion, optical throughput, or physical photodiode truth.

Use `kind: "unresolved"` when the geometric footprint is known to be required but its shape/dimensions are not defensibly available. Resolution then fails closed instead of fabricating a rectangle from site pitch, megapixels, or a fill-factor percentage.

The first sampling-aperture model explicitly excludes:

- effective AA point splitting;
- microlens spatial redirection;
- charge diffusion;
- electrical/optical crosstalk;
- wavelength/spectral response;
- quantum efficiency;
- optical transmission/throughput;
- calibrated radiometric collection area.

Those effects may change the **effective** spatial response or sensitivity even when the geometric sensitive region is unchanged. For example, microlenses can redirect incident light toward the photosensitive portion of a front-illuminated pixel, and their effectiveness can vary with incidence angle. The geometric aperture must therefore not absorb microlens behavior silently.

Physical camera orientation remains downstream. The site lattice and aperture stay in invariant native sensor physical coordinates.

## Sensor spatial-sampling quadrature

Use `calculateSensorSpatialSamplingQuadrature()` to build deterministic renderer-neutral spatial integration nodes for one resolved color-sampling site after combining:

1. the geometric sensitive aperture from `SensorSamplingApertureProfile`; and
2. the effective anti-aliasing point-splitting response from `SensorOpticalStackProfile`.

```ts
import {
  calculateSensorSpatialSamplingQuadrature
} from "@photivra/engine";

const quadrature =
  calculateSensorSpatialSamplingQuadrature({
    imagingArea: { widthMm: 36, heightMm: 24 },
    nativeRaster: {
      pixelWidth: 6000,
      pixelHeight: 4000
    },
    colorSamplingProfile: topology,
    colorSamplingBindingProfile: binding,
    samplingApertureProfile: sampling,
    opticalStackProfile: stack,
    site: { x: 100, y: 200 },
    spatialSampleCountX: 4,
    spatialSampleCountY: 4
  });

console.log(quadrature.value.nodes);
```

The first scheme is a tensor-product uniform midpoint rule over the geometric aperture. Each AA split component multiplies that aperture quadrature.

AA composition uses **inverse source sampling**. If the optical stack declares that a component displaces optical energy by `+delta` on the sensor plane, a destination aperture point reads the pre-AA optical field at:

```text
pre-AA source = destination aperture point - AA displacement
```

The destination sensor site's CFA/color channel applies to every node. A shifted pre-AA source coordinate is an optical-field location, not another CFA site, so it never reassigns the destination CFA channel.

Two measures are returned separately:

- `combinedNormalizedSpatialWeight` — dimensionless weight for approximating a spatial average;
- `combinedAreaMeasureSquareMicrometers` — geometric area measure for approximating a spatial area integral.

The area measure is **not** effective radiometric collection area, throughput, QE, or photon count.

Near sensor edges, AA inverse-source coordinates may lie outside the active physical imaging area. Those nodes remain valid and are retained. Photivra does not clamp them, drop them, or renormalize the remaining weights. A renderer/optical-field provider owns source-coverage policy.

The API intentionally returns geometry and measures only. It does not evaluate optical-field values, radiance, spectral response, photons/electrons, temporal exposure, RAW values, or reconstruction. Spatial and temporal quadrature remain separate until a later explicit composition evaluates a common downstream field.

Because spatial integration error depends on the downstream optical field's spatial-frequency/content, Photivra does not report a geometry-only convergence/error estimate. Reference rendering can compare increasing spatial sample counts in the quantity actually being integrated.

A per-site node allocation safety limit prevents malformed/untrusted counts from creating an oversized array in one call.

## Sensor spatial-sample reduction

Use `reduceSensorSpatialSamplingQuadrature()` after a renderer or optical model has evaluated one scalar value at every spatial quadrature node's `preAntiAliasingSourcePointMm`.

Node values are identified by the quadrature identity tuple—AA component index plus aperture X/Y sample indices—rather than by array position.

Two input domains are supported:

- `relative-linear`: a nonnegative dimensionless irradiance-like proxy for deterministic regression/testing;
- `radiometric-irradiance`: physical sensor-plane irradiance in W/m².

The physical domain follows standard radiometric meaning: irradiance is incident radiant flux per unit area, so integrating W/m² over the geometric aperture area yields incident radiant flux in watts. This still remains upstream of CFA spectral response, microlens response, QE, exposure-time integration, and sensor conversion.

The reducer returns both a normalized spatial average and an area-weighted integral. For relative values the area integral is relative-value × µm²; for physical irradiance it is converted to watts.

The CFA `channelId` is descriptive metadata only. No wavelength-dependent filter/sensor response is applied, so the output is **not** a physically color-filtered mosaic value and must not be called RAW.

Every quadrature node requires an explicit nonnegative finite input, including nodes whose pre-AA source coordinate lies outside the active imaging area. The reducer never clamps, zero-fills, extrapolates, drops, or renormalizes missing edge support.

Signed color-transform intermediates, RGB display values, gamma-encoded values, radiance, spectral irradiance, temporal exposure, photons/electrons, noise, saturation, black level, ADC quantization, RAW codes, and demosaic/reconstruction are outside this contract.

## Sensor spectral response

Use `parseSensorSpectralResponseProfile()` to declare wavelength-dependent response for exact semantic channel IDs from a linked `SensorColorSamplingProfile`, and `resolveSensorSpectralResponseAtWavelength()` to evaluate one channel at one wavelength.

The first contract supports three evidence models:

- **direct effective external QE** — dimensionless generated-charge/incident-photon response for the declared response scope;
- **direct effective spectral responsivity** — A/W as a distinct physical representation;
- **separable channel-filter transmittance × detector external QE** — only when both components are independently established and explicitly declared separable.

Do not force a real measured effective response into filter and detector components when the source does not support that decomposition. Conversely, do not apply upstream optical/filter terms again to a response whose scope already includes them.

Curve rules are intentionally strict:

- wavelength unit is nanometres;
- wavelength basis is explicitly `air`, `vacuum`, or `unspecified`;
- calibrated response may not use an unspecified wavelength basis;
- sample wavelengths are strictly increasing;
- fraction curves are constrained to [0, 1];
- A/W responsivity is nonnegative;
- interpolation is piecewise-linear;
- requests outside the declared wavelength range fail closed;
- Photivra never assumes response becomes zero outside the measured range.

Embedded multi-point numeric curves require at least one `reusable-data` or `photivra-owned` evidence record. Publicly viewable/manufacturer curves that are only factual-reference material may guide research, but cannot be copied into the public engine without reuse rights.

Channel IDs remain exact. If two mosaic positions require different green-channel response curves, the color topology must use distinct semantic IDs such as `green-a` and `green-b`; one shared `green` ID means one shared semantic channel for this contract.

The resolver validates the entire spectral profile against the linked topology. Unknown channels fail closed. Layered-color topology remains fail-closed because its per-layer spatial relationship is still unresolved.

Optional reference temperature, incidence angle, and polarization metadata may record the condition under which a curve applies. Schema 0.1.0 does not model response variation with those conditions.

This foundation performs **spectral lookup only**. It does not:

- integrate spectral irradiance over wavelength;
- convert A/W responsivity to QE or vice versa;
- calculate photons or electrons;
- apply temporal exposure integration;
- generate RAW values;
- demosaic/remosaic or reconstruct pixels.

Those remain explicit downstream steps.

## Sensor spectral quadrature

Use `calculateSensorSpectralQuadrature()` to build a deterministic wavelength-sampling plan for one exact sensor-response channel before any source spectrum or sensor response is integrated.

```ts
import { calculateSensorSpectralQuadrature } from "@photivra/engine";

const plan = calculateSensorSpectralQuadrature({
  colorSamplingProfile,
  spectralResponseProfile,
  channelId: "red",
  wavelengthBasis: "air",
  wavelengthRangeNanometers: {
    minimum: 400,
    maximum: 700
  },
  maximumSubintervalWidthNanometers: 5,
  additionalBreakpointsNanometers: [500, 600]
});

console.log(plan.value.nodes[0]?.wavelengthNanometers);
console.log(plan.value.nodes[0]?.wavelengthMeasureNanometers);
```

The requested range edges, every applicable sensor-response curve knot, and optional caller-supplied breakpoints form the segment boundaries. Each segment is then subdivided until every midpoint subinterval is no wider than `maximumSubintervalWidthNanometers`.

`wavelengthMeasureNanometers` is **dλ in nanometres**. `normalizedWavelengthWeight` is only that wavelength measure divided by the total requested span. Neither value includes QE, A/W responsivity, channel-filter transmission, lens transmission, source power, photon flux, or any other physical response factor.

The requested wavelength range must lie wholly inside the selected response channel's usable declared range. Photivra does not clip, extrapolate, or implicitly zero-fill response outside that range. This check proves only **sensor-response support**; it does not prove that scene spectral data, optical transmission, or another wavelength-dependent input covers the same interval.

`additionalBreakpointsNanometers` is intended for known interpolation knots or discontinuity boundaries from other **continuous spectral-density** factors. It must be strictly increasing, contain no duplicates, and remain strictly inside the requested range. This API does not ingest those external spectra and does not claim their provenance or validity.

The plan preserves the selected response kind, response scope, scientific status, uncertainty declaration, and response-data evidence, but it deliberately **does not apply response values at the nodes**. That boundary matters because:

- external QE is a dimensionless photon-to-generated-charge efficiency;
- spectral responsivity in A/W maps incident radiant power to electrical current;
- those representations require different compatible downstream source/signal semantics and must not be collapsed into one integration formula;
- response scope must be matched to the source plane and collection-area semantics so upstream transmission is neither omitted nor double-counted.

The first quadrature contract targets continuous spectral densities. Discrete/delta-like emission lines need a separate explicit representation rather than being hidden inside a midpoint grid.

A bounded wavelength step and alignment to known response knots improve deterministic sampling, but neither proves convergence for an arbitrary integrand. The planner therefore reports no source-independent numerical error estimate.

This foundation still does **not**:

- evaluate scene spectral irradiance or spectral photon irradiance;
- apply sensor response;
- validate a common spectral interval across scene, optics, and sensor data;
- combine spectral nodes with spatial or temporal quadrature;
- calculate radiant energy, photons, electrons, current, noise, ADC values, or RAW codes;
- perform demosaic/remosaic or reconstruction.

Those remain later explicit, versioned composition steps.

## Sensor spatio-spectral irradiance reduction

Use `reduceSensorSpatioSpectralIrradiance()` after a renderer or optical model has evaluated spectral irradiance at every Cartesian product of:

- one spatial quadrature node's `preAntiAliasingSourcePointMm`; and
- one spectral quadrature wavelength.

The required source value is (E_λ(x,y)) in **W/m²/nm**.

```ts
import {
  reduceSensorSpatioSpectralIrradiance
} from "@photivra/engine";

const reduced =
  reduceSensorSpatioSpectralIrradiance({
    spatialQuadrature:
      spatialPlan.value,
    spectralQuadrature:
      spectralPlan.value,
    sampleValues
  });

console.log(
  reduced.value
    .wavelengthIntegratedSpatialAverageIrradianceWattsPerSquareMeter
);
console.log(
  reduced.value
    .wavelengthIntegratedGeometricApertureIncidentFluxWatts
);
```

The reducer validates both plans again at runtime and requires exact `colorSamplingProfileId` and `channelId` agreement. A shared label such as `"red"` is not enough to establish that two independently created plans belong to the same color topology.

Each supplied sample identity contains the full spatial-node identity, `spectralSampleIndex`, and exact wavelength. Array order is irrelevant. Every spatial × spectral pair must be present exactly once.

The Cartesian product has its own **100,000-value safety limit**. The individual spatial and spectral plans may each be below their own limits while their product is still too large to materialize safely.

For each wavelength node, Photivra computes:

- a normalized spatial-average spectral irradiance in W/m²/nm;
- geometric-aperture incident spectral flux density in W/nm.

It then multiplies those densities by that node's `wavelengthMeasureNanometers` and sums across the requested wavelength interval, yielding:

- wavelength-integrated spatial-average irradiance in W/m²;
- wavelength-integrated geometric-aperture incident flux in W.

Because the source density is **per nanometre**, `dλ` remains in nanometres in this multiplication. Do not multiply by (10^{-9}) unless the spectral-density denominator has also been converted from per-nanometre to per-metre.

The geometric-aperture flux remains a **geometric incident-flux** result. The current aperture model does not establish effective collection area, microlens collection efficiency, or another radiometric-area correction.

This reducer intentionally stops **before sensor response**. The wavelength plan is response-derived, but no QE, A/W responsivity, or channel-filter transmission is applied. Response scope is carried forward but is not yet matched to a declared source plane. That avoids two invalid shortcuts:

- treating QE as though it were an energy weighting on W/m²/nm;
- treating A/W responsivity as though it were a photon-to-electron efficiency.

Temporal exposure integration, photons/electrons, electrical current, noise, ADC/RAW conversion, and reconstruction also remain downstream.

The current AA point-splitting kernel is a normalized, wavelength-invariant spatial redistribution approximation. Spectral variation in the supplied (E_λ(x,y)) can still represent wavelength-dependent upstream optics/scene structure, but this reducer does not invent wavelength dependence in the AA kernel itself.

As with the spatial and spectral planners individually, no source-independent convergence/error estimate is reported. Reference work should test convergence in the actual downstream integrand by increasing spatial and/or wavelength sampling.

## Sensor response application compatibility

Use `assessSensorResponseApplicationCompatibility()` before any future sensor-response conversion. The assessment is deliberately a **structural gate**, not a response application function.

It requires an evidence-backed `SensorResponseApplicationProfile` that binds one exact spectral-response profile/channel to the sampling-aperture and optical-stack identities used by the spatial plan. It also declares:

- the response's incident-area normalization;
- whether a single wavelength-only response can be treated as uniform/separable over the geometric sensitive aperture;
- how response reference conditions are handled.

The caller separately declares whether the supplied radiometric field is at the `sensor-package-incident` or `site-incident` response reference plane. That declaration carries provenance.

A response scope and source plane must match exactly:

- `sensor-package-incident-effective-channel-response` requires a sensor-package-incident source;
- site-incident effective response and separable channel-filter × detector-EQE require a site-incident source.

The current spatio-spectral reducer integrates **geometric-sensitive-aperture** flux only. Therefore the first compatibility gate accepts response application only when the response's incident-area basis is that same geometric sensitive aperture and its declared area matches. A response normalized to the full site cell or an effective collection area is reported as blocked rather than silently reused.

This distinction is important for common image-sensor QE conventions: a total-pixel QE can be defined against photons incident on the whole pixel area and may therefore already include fill-factor and microlens effects. Such a response is not interchangeable with a curve normalized to photons incident only on the geometric sensitive aperture.

Spatial response is a separate gate as well. Reducing the field spatially before applying one scalar response (R(λ)) assumes response is effectively uniform/separable over the integrated aperture. If that is not established, the gate blocks post-spatial application because the physically correct model may require (R(λ,x,y)) at the original spatial nodes.

Reference conditions are also fail-closed. With `exact-match-required`, the response must declare reference conditions and the caller must provide matching operating temperature, incidence angle, and/or polarization for every condition present in that reference. `assume-compatible` is allowed only as an explicit evidence-backed approximation with a limitation.

An unresolved wavelength basis blocks the gate.

A successful assessment reports the future signal path:

- EQE and filter×EQE → `photon-rate-to-electrons`;
- A/W responsivity → `radiant-power-to-current`.

Even a successful assessment keeps `signalConversionAuthorized: false`. Response linearity/dynamic-range validity is not yet assessed, and no response, photon/electron, current, temporal, noise, ADC, RAW, or reconstruction calculation is performed.

## Sensor response operating range

Use `assessSensorResponseOperatingRange()` after structural response compatibility has passed. This second gate asks a narrower question: is the **instantaneous optical input** inside a response-law range for which the detector's linearity has been explicitly characterized?

The operating-range profile is evidence-backed and preserves the quantity that was actually calibrated:

- wavelength-integrated geometric-aperture radiant power in W; or
- wavelength-integrated spatial-average irradiance in W/m².

Photivra does not substitute one for the other.

The profile also declares:

- the applicable air/vacuum wavelength basis;
- a wavelength interval that must contain the reduction's requested interval;
- the inclusive optical-input range;
- the maximum absolute relative response deviation accepted as "linear" for that range;
- scientific status and uncertainty;
- reference temperature/incidence-angle/polarization conditions and their matching policy.

The assessment first requires the prior structural compatibility result to be non-blocked and to refer to the same response application, spectral response, color topology and channel. It then checks wavelength basis/range, optical-input level and linearity-calibration conditions.

The operating-range profile also distinguishes **broadband-only** validation from **per-spectral-bin** validation. Broadband-only evidence can establish that the total optical input is inside a characterized range, but it cannot authorize wavelength-dependent EQE or A/W conversion.

For `per-spectral-bin` applicability, the profile declares a maximum supported bin width. Every wavelength node's own integrated power or irradiance contribution must remain inside the calibrated range, and no quadrature bin may exceed that width. This prevents one over-range wavelength band from hiding inside an acceptable broadband total and prevents a broad numerical bin from masquerading as a narrowband calibration point.

Only a non-blocked per-bin assessment can set `responseRateConversionAuthorized: true`. That authorization is deliberately limited to a future **instantaneous rate-domain conversion**.

It does **not** establish:

- exposure-domain characteristic-curve linearity;
- accumulated-charge/full-well saturation;
- conversion-gain linearity;
- readout/amplifier linearity;
- ADC linearity or clipping;
- RAW-code validity.

Those depend on temporal integration and downstream electronics and remain separate gates. In particular, an optical detector can be linear over a given incident-power range while a camera exposure still saturates after sufficient integration time.

The first operating-range model also does not infer a valid wavelength interval from one or a few isolated linearity measurements. If a source only establishes linearity at specific wavelengths, a continuous wavelength applicability range must not be fabricated.

## Photon energy wavelength basis

Use `calculatePhotonEnergyFromWavelength()` when a later photon-domain calculation needs (hν).

For a vacuum-basis wavelength, Photivra uses the exact SI defining constants:

- (h = 6.62607015 × 10^{-34}) J·s;
- (c = 299792458) m/s.

The calculation is (ν = c / λ_mathrm{vac}) and (E_mathrm{photon} = hν).

For an **air-basis** wavelength, the wavelength cannot be substituted directly into (hc/λ). The caller must provide a sourced phase refractive index at that **exact wavelength** using the explicit definition:

`n = λ_vacuum / λ_air`.

Photivra then computes `λ_vacuum = n × λ_air` before deriving frequency and photon energy.

The air refractive-index sample carries scientific status, uncertainty, evidence, and optional reference atmosphere. Calibrated samples require quantified relative uncertainty plus temperature and pressure reference conditions.

Air refractive index also depends on atmospheric conditions. Therefore an air-basis photon-energy calculation requires one of two policies:

- `exact-match-required`: the caller supplies operating atmosphere conditions that match the refractive-index reference temperature/pressure and any declared humidity/CO₂ fields;
- `assume-compatible`: an explicit evidence-backed approximation with a limitation.

Photivra never silently sets (n=1).

The current foundation preserves refractive-index uncertainty but does **not** propagate that uncertainty into the derived photon energy. It also does not apply QE, calculate photon rate, generate electrons, integrate exposure time, or model saturation/noise.

## EQE electron-rate conversion

Use `calculateSensorEqeElectronRate()` only after both the structural response-application assessment and the instantaneous response operating-range assessment have passed.

The converter accepts the original color-sampling and spectral-response profiles in addition to those assessments. Spectral planning now carries an exact canonical response-channel data binding through the pre-response reduction. The converter reparses the supplied response once and requires that binding to match exactly, so matching IDs and even matching evidence references are not enough when numeric calibration samples differ.

The canonical binding is a deterministic exact-data identity for stale/calibration substitution detection; it is not presented as a cryptographic checksum or security boundary.

The calculation stays in the wavelength quadrature. For every spectral node it computes:

1. radiant-power contribution = geometric-aperture spectral flux density × `dλ`;
2. photon energy (hν), using the photon-energy wavelength-basis foundation;
3. incident photon rate = radiant power / photon energy;
4. effective external QE at that exact wavelength through the existing spectral-response resolver;
5. expected generated-electron rate = photon rate × effective QE.

Direct effective EQE stays direct. When the response profile explicitly declares channel-filter transmittance × detector EQE as separable, the existing resolver is the only component that multiplies those terms; the converter does not invent or repeat filter composition.

The response is applied **per wavelength node**. Photivra never multiplies total broadband radiant power by a single average QE.

Post-spatial response also requires the operating-range profile to establish **linear superposition over the geometric sensitive aperture**. If that declaration is omitted, it remains `not-established` and rate conversion is blocked. This prevents spatial averaging from silently hiding a sub-aperture nonlinear response.

The EQE converter additionally requires the operating-range assessment's per-bin identities and calibrated-domain values to match the exact wavelength nodes in the reduction. A stale assessment cannot be reused after spectral power, node width, wavelength, or identity changes.

For air-basis spectral nodes, the caller supplies exactly one sourced phase-refractive-index record for every spectral sample identity plus the atmosphere compatibility policy used by the photon-energy foundation. Vacuum-basis conversion accepts no air-index context.

The output reports:

- incident photon rate in photons/s;
- expected generated-electron rate in electrons/s;
- per-wavelength power, photon energy, QE and rate contributions;
- whether channel-filter transmission was part of an explicitly separable response.

Kahan compensated summation is used across wavelength nodes.

This is still **rate-domain only**. The converter does not:

- multiply by exposure time;
- output photon or electron counts;
- assess full-well/saturation;
- apply photon shot noise or read noise;
- calculate current from A/W responsivity;
- perform ADC/RAW conversion or reconstruction.

A/W spectral responsivity is rejected by this API and remains a separate radiant-power→current path.

Response, refractive-index and quadrature uncertainties remain visible upstream but are not yet propagated into a combined electron-rate uncertainty.

## A/W responsivity photocurrent conversion

Use `calculateSensorResponsivityPhotocurrent()` for the sibling current-domain path when the spectral response is explicitly calibrated in **A/W**.

The same structural and operating-range gates used by EQE still apply: exact response/profile linkage, matching response reference plane and area basis, spatial response uniformity/separability, linear superposition over the geometric aperture, and explicit per-spectral-bin operating-range applicability. The exact canonical response-channel binding must also match the curve data used upstream; same IDs/evidence with altered A/W samples are rejected.

For every spectral node Photivra computes:

1. radiant-power contribution = geometric-aperture spectral flux density × `dλ`;
2. spectral responsivity in A/W at that exact wavelength using the authoritative response resolver;
3. photocurrent-magnitude contribution = radiant power × responsivity.

The wavelength contributions are summed with Kahan compensated summation.

A/W also has an additional **electrical calibration applicability** contract. `SensorResponsivityElectricalApplicabilityProfile` binds the response pipeline to the detector electrical conditions under which the A/W calibration is intended to apply:

- zero-bias photovoltaic operation or reverse bias with an explicit magnitude;
- virtual-ground current readout or a finite declared input impedance;
- exact-match or explicit evidence-backed compatibility-approximation policy.

These fields are applicability metadata, not a circuit simulator. In particular, Photivra does not use a declared input impedance to claim that a transimpedance circuit is adequate; it only verifies that the operating condition matches the calibration contract.

The electrical categories are intentionally disjoint: `reverse-biased` requires a strictly positive reverse-bias magnitude, while true zero-bias operation uses `zero-bias-photovoltaic`; a finite input impedance must also be strictly greater than zero.

The spectral A/W curve is treated as a **quasi-static steady-state** power→current relation only. Detector impulse response, modulation bandwidth, settling time and frequency-dependent responsivity are not modeled by this first path. A future time-varying current integrator must add a separate temporal-response contract before it can consume rapidly varying optical power.

The result is a **nonnegative detector-terminal photocurrent magnitude in amperes**. Photivra intentionally does not assign circuit direction/polarity from the optical response curve.

The A/W path does **not**:

- use photon energy or calculate photon/electron rate;
- convert current to accumulated charge;
- apply exposure duration;
- apply transimpedance gain or offset;
- calculate detector/readout voltage;
- establish amplifier or ADC linearity;
- assess full-well/saturation;
- add shot/read noise;
- produce RAW values or reconstructed pixels.

Those remain later explicit stages.

## Local sensor-rate/exposure binding

Use `bindSensorRateToLocalExposure()` before any response-rate result is integrated over time.

Engine-produced EQE electron-rate and A/W photocurrent results preserve the exact abstract color-sampling site that generated the response. The binding resolves that site against the exact color topology and the existing native-effective-raster/color-site binding before selecting a local shutter window.

The first temporal registration is deliberately narrow: `sitesPerNativeSampleX` and `sitesPerNativeSampleY` must both equal 1. Under that evidenced shared-top-left relationship, color-site `(x, y)` maps to native effective sample center `(x + 0.5, y + 0.5)`.

A multi-site block binding is **not** enough to infer sub-sample timing coordinates. When one native effective sample spans multiple color sites, Photivra fails closed rather than inventing where each site lies inside that effective sample for a spatially varying shutter scan.

The binding then calls the authoritative capture exposure-window calculation at that exact native point. It verifies that:

- the rate carries a valid site;
- the bound color site exists and resolves to the same channel as the rate;
- the binding belongs to the same color topology and exact native raster used by the exposure schedule;
- the bound point lies inside the active capture;
- the local window has positive finite duration.

The result preserves local start/end offsets and duration in the exposure schedule's `first-opening-boundary-phase` time basis.

This is a **timing binding only**. It explicitly reports:

- no physical-photodiode timing registration;
- no multi-frame sequence binding;
- no time-stationarity guarantee;
- `constantRateTemporalIntegrationAuthorized: false`.

A response rate may therefore **not** yet be multiplied by this duration. Motion, flicker, flash, time-varying illumination/vignetting, shutter modulation, or detector transients require a time-dependent signal model. A separate stationarity contract is required for the constant-rate approximation.

## Constant-rate local-exposure integration

Use `integrateStationarySensorRateOverLocalExposure()` only when an evidence-backed `SensorRateTemporalStationarityProfile` explicitly states that the **reported rate itself** is constant through the exact local exposure window.

The stationarity declaration is bound to:

- EQE-vs-A/W rate domain;
- color topology/channel/site;
- local-exposure binding ID;
- exact local start/end offsets in the `first-opening-boundary-phase` time basis.

It therefore cannot be silently reused for a different site or shutter window.

Under that explicit model, temporal integration is exactly:

`accumulated quantity = reported rate × local exposure duration`.

For the EQE path:

- incident photon rate becomes **expected incident photon count**;
- expected generated-electron rate becomes **expected generated-electron count**;
- expectation values remain floating point and are not rounded or stochastically sampled.

For the A/W path:

- detector-terminal photocurrent magnitude becomes **photocharge magnitude in coulombs**;
- circuit polarity is still not inferred;
- carrier/electron count is deliberately **not** inferred from A/W current.

The A/W constant-current approximation also inherits the upstream quasi-static detector-response boundary. The stationarity evidence must justify treating the reported steady-state photocurrent as valid throughout the window; Photivra still does not model detector impulse response or bandwidth.

The result is explicitly **photo-signal-only** accumulation. It does not include dark current, hot-pixel/defect current, leakage, charge injection, or other accumulated charge sources. Accordingly:

- physical full-well assessment is not authorized;
- camera/digital saturation assessment is not authorized;
- no clamp is applied;
- shot/read noise, conversion gain, ADC/RAW and reconstruction remain downstream.

Physical full-well capacity and camera saturation capacity must remain separate future contracts; they are not interchangeable thresholds.

## Dark-current charge

Use `calculateSensorDarkCurrentCharge()` only with an EQE expected-count exposure result. The current path models **pre-compensation thermally generated electrons** in e⁻/s and integrates that rate over the exact local exposure duration already established by the temporal pipeline.

Photivra deliberately does not impose one universal dark-current temperature law. A dark-current profile may provide either:

- one exact reference temperature and one dark-current rate; or
- a strictly increasing measured temperature table with piecewise-linear interpolation and fail-closed behavior outside the measured range.

A population-mean dark-current profile is allowed only as an explicit approximation and must not claim pixel/site dark-current nonuniformity is modeled. Exact-site profiles remain bound to the exact color-sampling site.

Dark-current compensation, black-level offset, hot-pixel/defect excess, leakage, charge injection and other charge sources are separate. The result is an **expected dark-electron count** only; no Poisson sampling or dark-current shot-noise realization is performed.

This stage still does not authorize physical full-well assessment because the accumulated sensor charge is not yet complete. It also does not apply to the A/W current-domain path: integrated detector-terminal charge must not be reinterpreted as stored sensor electrons without a separate carrier/storage mapping.

## Accumulated-charge completeness

Use `composeSensorAccumulatedCharge()` after an EQE photo-signal exposure and its matching dark-current result exist for the **same exact local exposure event**.

The composer requires photo and dark terms to share:

- color topology/channel/site;
- local-exposure binding ID;
- stationarity profile ID where applicable;
- exact start/end offsets in the `first-opening-boundary-phase` time basis;
- the same local exposure duration.

Equal duration alone is insufficient.

Additional stored-electron components may represent explicitly modeled defect/hot-pixel excess, leakage, charge injection, clock-induced charge, or another identified source. Every component must declare the accounting meaning `incremental-stored-electrons-beyond-photo-and-modeled-dark-current`. This prevents an additional defect/leakage model from silently re-counting electrons already represented by the dark-current term.

A separate evidence-backed `SensorAccumulatedChargeCompletenessProfile` lists the exact additional-component IDs and states that all material stored-electron contributors relevant to physical charge-storage capacity are accounted for. An empty additional-component list is therefore **not itself evidence of completeness**.

When all bindings and the completeness declaration pass, the result reports:

- expected photo electrons;
- expected dark electrons;
- expected additional stored electrons;
- total expected stored electrons.

All remain expectation values. No photo/dark shot-noise realization or integer carrier sampling is performed.

Only this complete stored-electron result sets `physicalFullWellAssessmentAuthorized: true`. Camera/digital saturation remains separately unauthorized because camera saturation capacity is not the same physical quantity as full-well charge storage.

A/W photocharge remains outside this composition because detector-terminal coulombs are not automatically the number of electrons stored in the pixel charge well.

## Physical charge-capacity

Use `assessSensorPhysicalChargeCapacity()` only after accumulated-charge completeness has explicitly authorized physical capacity assessment.

A `SensorPhysicalChargeCapacityProfile` describes a sourced physical charge-storage limit in **electrons**. The profile is bound to:

- exact color topology/channel;
- exact site, or an explicit uniform-site approximation;
- an evidence-backed operating-state identifier;
- exact reference temperature, or an explicit approximation stating temperature dependence is not modeled.

The operating-state identifier is deliberately opaque. Photivra does not infer the correct physical storage capacity from ISO, gain labels, capture-mode names, pixel pitch, or another nearby specification.

The assessment compares **total expected stored electrons** with the physical capacity and reports:

- charge/capacity ratio;
- expected headroom in electrons;
- `below-capacity`, `at-capacity`, or `above-capacity`;
- whether the unsaturated expected charge exceeds the declared capacity.

This is an expectation comparison, not a stochastic saturation realization. Expected charge below capacity does not prove that every noisy realization remains below capacity. Expected charge above capacity means the unsaturated linear expectation exceeds the physical storage limit.

Photivra does **not** clamp the charge at capacity. It does not calculate post-saturation stored charge, excess/overflow charge, recombination, anti-blooming drain behavior, or neighbor blooming. Those require a separate nonlinear charge-transfer model.

Physical charge capacity is also **not camera saturation capacity**. Camera/analog/digital clipping can occur at a lower signal level, so camera saturation remains a separate downstream contract.

## Camera saturation capacity

Use `assessSensorCameraSaturationCapacity()` for a source-specific **camera response-chain saturation capacity** expressed as dark-corrected photo-generated electron-equivalent signal.

This contract intentionally uses a different signal domain from physical charge storage:

- the comparison input is `photoExpectedElectronCount`;
- total photo + dark + other stored charge is retained only as a diagnostic;
- total stored charge is **not** added to the camera-signal capacity comparison.

That separation matches camera-characterization practice in which saturation capacity is derived from the camera's saturated photo response and can be lower than physical full-well because a downstream response stage may clip first.

A camera saturation profile is bound to the exact color/channel, site applicability, operating-state identifier, temperature applicability, measurement method, uncertainty, and evidence. A channel-population mean used for one site remains an approximation.

The assessment reports photo-signal/capacity ratio, headroom, and below/at/above-capacity status. It does not:

- identify which analog or digital stage limits the response;
- infer an ADC maximum code or bit-depth clipping threshold;
- reuse physical full-well capacity;
- modify physical stored charge;
- clamp the output signal;
- calculate a post-saturation transfer curve;
- establish stochastic saturation probability.

Stage-specific analog clipping, ADC/digital code limits, and RAW-code behavior require separate evidence-backed response-chain contracts.

## Capture-mode profiles

Use `parseCaptureModeProfile()` and `resolveCaptureMode()` to describe how one physical sensor can expose different acquisition/sampling/reconstruction modes without changing sensor identity:

```ts
import {
  parseCaptureModeProfile,
  resolveCaptureMode
} from "@photivra/engine";

const modes = parseCaptureModeProfile({
  schemaVersion: "0.1.0",
  modes: [
    {
      modeId: "pixel-shift-4",
      evidence: [
        {
          sourceOrigin: "manufacturer",
          sourceReference: "example:pixel-shift-mode",
          reuseStatus: "factual-reference-only"
        }
      ],
      acquisition: {
        kind: "fixed-multi-frame",
        frameCount: {
          value: 4,
          evidence: [
            {
              sourceOrigin: "manufacturer",
              sourceReference: "example:pixel-shift-frame-count",
              reuseStatus: "factual-reference-only"
            }
          ]
        }
      },
      perFrameSampling: {
        kind: "native-effective-raster"
      },
      interFrameSensorOffsetsNativeSamples: {
        value: [
          { x: 0, y: 0 },
          { x: 0.5, y: 0 },
          { x: 0, y: 0.5 },
          { x: 0.5, y: 0.5 }
        ],
        evidence: [
          {
            sourceOrigin: "manufacturer",
            sourceReference: "example:pixel-shift-offset-sequence",
            reuseStatus: "factual-reference-only"
          }
        ]
      },
      reconstructionStages: [
        {
          value: "pixel-shift-combination",
          evidence: [
            {
              sourceOrigin: "manufacturer",
              sourceReference: "example:pixel-shift-combination",
              reuseStatus: "factual-reference-only"
            }
          ]
        }
      ],
      processedImageRaster: {
        value: {
          pixelWidth: 12000,
          pixelHeight: 8000
        },
        evidence: [
          {
            sourceOrigin: "manufacturer",
            sourceReference: "example:processed-raster",
            reuseStatus: "factual-reference-only"
          }
        ]
      },
      dependencies: [
        "color-sampling-model",
        "inter-frame-registration"
      ]
    }
  ]
});

const selected = resolveCaptureMode({
  nativeRaster: {
    pixelWidth: 6000,
    pixelHeight: 4000
  },
  profile: modes,
  modeId: "pixel-shift-4"
});

console.log(selected.processedImageMegapixels);
```

The model is deliberately **orthogonal**, not one mutually exclusive marketing-style mode enum. A mode independently describes:

- acquisition as single-frame, fixed multi-frame, or variable multi-frame;
- per-frame sampling as the native effective raster, exact integer grouping of native effective samples, or another explicitly evidenced effective raster;
- an optional ordered inter-frame sensor-offset sequence for fixed multi-frame modes;
- zero or more reconstruction stages such as remosaic, pixel-shift combination, and generic multi-frame computational combination;
- the processed-image raster before final output crop/resampling;
- explicit downstream model dependencies.

This lets a computational multi-frame mode also use grouped per-frame sampling instead of forcing it into one exclusive category.

`NativeImageRaster` keeps its canonical meaning: an **effective native image-sampling grid**, not a physical photosite raster. Neither native megapixels nor processed/final-output megapixels may be used to infer physical photodiode count.

For grouped sampling, Photivra derives the per-frame sampling raster only when the native dimensions divide exactly by the evidenced grouping factors. The optional `combinationDomain` distinguishes `charge-domain`, `pre-conversion-analog`, and `post-conversion-digital`. When that fact is not known it must be omitted; the word “binning” or a 2×2 resolution ratio does not establish where combination occurred.

Inter-frame sensor offsets are expressed in units of the **native effective sampling pitch**. They are not evidence of physical photodiode pitch. The offset sequence length must match a fixed multi-frame count when supplied.

`processedImageRaster` belongs to the capture-mode/reconstruction pipeline. It does not change physical imaging area, crop factor, field of view, or the native effective raster. It may be larger than the native raster for a multi-frame reconstruction without implying a higher-resolution physical sensor.

Final output crop/resampling remains owned by the existing staged capture/output geometry contract. A processed raster therefore does not itself define final display/export dimensions or viewing FOV.

The capture-mode schema records dependencies such as `color-sampling-model`, `mode-specific-readout-timing`, `radiometric-calibration`, and `inter-frame-registration` without pretending those downstream models are already implemented.

## Sensor readout timing

Use `calculateSensorReadoutTiming()` for a capture-specific native sensor scan schedule without conflating sensor readout with shutter-curtain timing:

```ts
import {
  calculateSensorReadoutTiming,
  transformNativeRasterVectorToOriented
} from "@photivra/engine";

const timing = calculateSensorReadoutTiming({
  nativeRaster: { pixelWidth: 6000, pixelHeight: 4000 },
  activeCaptureRect: { x: 0, y: 0, width: 6000, height: 4000 },
  shutterMechanism: "electronic",
  readout: {
    readoutMode: "rolling",
    captureReadoutDurationSeconds: {
      value: 0.024,
      unit: "s",
      evidence: [
        {
          sourceOrigin: "manufacturer",
          sourceReference: "manufacturer-spec:example",
          reuseStatus: "factual-reference-only"
        }
      ]
    },
    scanDirectionNative: {
      value: "top-to-bottom",
      evidence: [
        {
          sourceOrigin: "manufacturer",
          sourceReference: "manufacturer-spec:direction-example",
          reuseStatus: "factual-reference-only"
        }
      ]
    },
    spatialSamplingSkewSeconds: {
      value: 0.020,
      unit: "s",
      evidence: [
        {
          sourceOrigin: "third-party",
          sourceReference: "measurement:spatial-skew-example",
          reuseStatus: "factual-reference-only"
        }
      ]
    }
  },
  samplePointsNative: [
    { x: 3000, y: 0 },
    { x: 3000, y: 2000 },
    { x: 3000, y: 4000 }
  ]
});

console.log(timing.value.samples);
console.log(timing.value.scan?.unitVectorNative);

const orientedDirection = transformNativeRasterVectorToOriented({
  vector: timing.value.scan?.unitVectorNative ?? { x: 0, y: 0 },
  orientation: "portrait-clockwise"
});
```

The two timing facts are intentionally separate. `captureReadoutDurationSeconds` records the selected capture's declared data-readout duration; `spatialSamplingSkewSeconds` drives only the spatial phase span of the current rolling approximation. Photivra does not assume those values are equal.

Global readout declares only the capture data-readout duration. Its spatial phase offset is zero everywhere even when that duration is non-zero.

The rolling schedule is a `uniform-linear-single-axis` approximation in invariant native sensor coordinates. `NativeImageRaster` remains an effective image-sampling grid, so this API does not claim that each raster row/column corresponds to one physical photodiode row or hardware readout line. Non-uniform, segmented, center-out, interleaved and multi-tap readout patterns are not represented by this first model.

Physical camera orientation is deliberately excluded from the timing input. Use the existing native↔oriented vector transform when a downstream renderer needs the scan direction in oriented capture coordinates. Output crop/resolution is also excluded and therefore cannot silently change native readout timing.

Active-crop/capture-mode timing must be supplied explicitly; the engine never scales full-frame timing from crop dimensions. Shutter mechanism is recorded independently and does not modify the schedule. Mechanical-curtain travel, EFCS timing, local exposure windows, rolling-shutter geometric distortion, flash/flicker interaction and motion integration remain future work.

## Readout/exposure spatial linkage

Use `assessReadoutExposureTimingLinkage()` when a specific capture-mode source supports a relationship between rolling sensor readout spatial order and an **electronic** exposure boundary:

```ts
import { assessReadoutExposureTimingLinkage } from "@photivra/engine";

const relationship = assessReadoutExposureTimingLinkage({
  nativeRaster: { pixelWidth: 6000, pixelHeight: 4000 },
  shutterMechanism: "electronic",
  readout: {
    readoutMode: "rolling",
    captureReadoutDurationSeconds: {
      value: 0.031,
      unit: "s",
      evidence: [
        {
          sourceOrigin: "manufacturer",
          sourceReference: "example:data-readout-duration",
          reuseStatus: "factual-reference-only"
        }
      ]
    },
    scanDirectionNative: {
      value: "top-to-bottom",
      evidence: [
        {
          sourceOrigin: "manufacturer",
          sourceReference: "example:readout-direction",
          reuseStatus: "factual-reference-only"
        }
      ]
    },
    spatialSamplingSkewSeconds: {
      value: 0.02,
      unit: "s",
      evidence: [
        {
          sourceOrigin: "photivra",
          sourceReference: "example:measured-spatial-skew",
          reuseStatus: "photivra-owned"
        }
      ]
    }
  },
  nominalExposureDurationSeconds: {
    value: 1 / 1000,
    unit: "s",
    evidence: [
      {
        sourceOrigin: "photivra",
        sourceReference: "example:capture-config",
        reuseStatus: "photivra-owned"
      }
    ]
  },
  opening: {
    kind: "uniform-linear-native-scan",
    directionNative: {
      value: "top-to-bottom",
      evidence: [
        {
          sourceOrigin: "manufacturer",
          sourceReference: "example:electronic-opening-direction",
          reuseStatus: "factual-reference-only"
        }
      ]
    },
    traversalDurationSeconds: {
      value: 0.01,
      unit: "s",
      evidence: [
        {
          sourceOrigin: "photivra",
          sourceReference: "example:opening-traversal",
          reuseStatus: "photivra-owned"
        }
      ]
    }
  },
  closing: {
    kind: "uniform-linear-native-scan",
    directionNative: {
      value: "top-to-bottom",
      evidence: [
        {
          sourceOrigin: "manufacturer",
          sourceReference: "example:electronic-closing-direction",
          reuseStatus: "factual-reference-only"
        }
      ]
    },
    traversalDurationSeconds: {
      value: 0.01,
      unit: "s",
      evidence: [
        {
          sourceOrigin: "photivra",
          sourceReference: "example:closing-traversal",
          reuseStatus: "photivra-owned"
        }
      ]
    }
  },
  linkage: {
    kind: "spatial-phase-linked",
    links: [
      {
        boundary: "opening",
        phaseOrientation: "same",
        evidence: [
          {
            sourceOrigin: "manufacturer",
            sourceReference: "example:documented-spatial-relationship",
            reuseStatus: "factual-reference-only"
          }
        ]
      }
    ]
  }
});

console.log(relationship.value.links[0]);
```

The positive link means only that the selected electronic exposure boundary shares the rolling readout's **normalized native spatial phase/order**:

- `same` means boundary phase equals readout phase;
- `reversed` means boundary phase equals `1 - readout phase`.

It does **not** mean the two events occur at the same absolute time.

The function therefore reports `absoluteTemporalAlignment: "not-established"` even when directions and first-to-last timing spans happen to match.

The readout spatial skew and exposure-boundary traversal duration may differ. Their ratio is reported as `boundaryTraversalToReadoutSpatialSkewRatio`, which is descriptive only.

The total `captureReadoutDurationSeconds` remains a separate evidence-backed fact and does not participate in linkage validation.

Only electronic boundaries can be spatial-phase-linked to sensor readout. A mechanical opening/closing boundary is rejected. Global readout has no rolling spatial phase and therefore cannot participate in this first linkage type.

Use `linkage: { kind: "unlinked" }` when Photivra should assert no relationship. This means **no relationship is asserted**; it does not establish that the underlying hardware processes are physically independent.

## Capture exposure-window timing

Use `calculateCaptureExposureWindows()` to describe when different native-sensor locations begin and end their local exposure without conflating shutter actuation with sensor readout:

```ts
import { calculateCaptureExposureWindows } from "@photivra/engine";

const windows = calculateCaptureExposureWindows({
  nativeRaster: { pixelWidth: 6000, pixelHeight: 4000 },
  shutterMechanism: "electronic-first-curtain",
  nominalExposureDurationSeconds: {
    value: 1 / 1000,
    unit: "s",
    evidence: [
      {
        sourceOrigin: "photivra",
        sourceReference: "capture-config:example",
        reuseStatus: "photivra-owned"
      }
    ]
  },
  opening: {
    kind: "uniform-linear-native-scan",
    directionNative: {
      value: "top-to-bottom",
      evidence: [
        {
          sourceOrigin: "photivra",
          sourceReference: "timing-profile:opening-direction",
          reuseStatus: "photivra-owned"
        }
      ]
    },
    traversalDurationSeconds: {
      value: 0.004,
      unit: "s",
      evidence: [
        {
          sourceOrigin: "photivra",
          sourceReference: "timing-profile:opening-traversal",
          reuseStatus: "photivra-owned"
        }
      ]
    }
  },
  closing: {
    kind: "uniform-linear-native-scan",
    directionNative: {
      value: "top-to-bottom",
      evidence: [
        {
          sourceOrigin: "photivra",
          sourceReference: "timing-profile:closing-direction",
          reuseStatus: "photivra-owned"
        }
      ]
    },
    traversalDurationSeconds: {
      value: 0.004,
      unit: "s",
      evidence: [
        {
          sourceOrigin: "photivra",
          sourceReference: "timing-profile:closing-traversal",
          reuseStatus: "photivra-owned"
        }
      ]
    }
  },
  samplePointsNative: [
    { x: 3000, y: 0 },
    { x: 3000, y: 2000 },
    { x: 3000, y: 4000 }
  ]
});

console.log(windows.value.samples);
console.log(windows.value.localExposureDurationRangeSeconds);
```

The time basis is `first-opening-boundary-phase`: zero means the first spatial phase of the declared opening boundary. This deliberately avoids pretending that a spatially scanned capture has one universal local exposure-start event.

Opening and closing schedules are independent. Each may currently be either:

- `simultaneous`; or
- `uniform-linear-native-scan` with its own evidence-backed native direction and traversal duration.

The nominal exposure duration is a separate evidence-backed quantity. For a native point:

```text
local start = opening phase
local end   = nominal exposure duration + closing phase
local duration = local end - local start
```

Matched opening/closing scans with equal traversal produce constant local exposure duration. Different directions or traversal durations can intentionally produce spatially varying local duration.

Photivra validates the **entire active rectangle**, not only supplied diagnostic points. Because the first schedules are affine over the native rectangle, corner extrema are sufficient to reject any declaration that would produce zero or negative local exposure duration somewhere in the capture.

`shutterMechanism` determines only the conceptual boundary actuators:

- `mechanical` → mechanical opening + mechanical closing;
- `electronic-first-curtain` → electronic opening + mechanical closing;
- `electronic` → electronic opening + electronic closing.

The mechanism does not supply traversal direction or timing.

This exposure-window model remains separate from `calculateSensorReadoutTiming()`. A later integration layer must explicitly bind exposure boundaries, sensor readout, and time-parameterized motion; Photivra does not assume a sensor readout phase is an exposure-start or exposure-end boundary.

Physical orientation and digital output geometry remain downstream. The schedule stays in invariant native sensor coordinates and can use the existing native↔oriented vector transforms when a consumer needs presentation-oriented direction.

The first model does not cover curtain acceleration, curved/nonlinear curtain travel, segmented/center-out/interleaved electronic schedules, flash/flicker interaction, shutter shock, EFCS-specific pupil/bokeh effects, or rolling-shutter image distortion.

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

See [Physics Foundation](PHYSICS_FOUNDATION.md#sensor-geometry-sampling-capture-and-crop).

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

## Relative pre-exposure metering

Use `parseExposureMeteringProfile()` and `meterRelativeExposure()` for the first renderer-neutral metering path.

Schema `0.1.0` deliberately accepts only **relative pre-exposure linear signal**. It does not claim calibrated luminance, scene spectral radiance, sensor-plane irradiance, or a commercial-camera meter calibration.

```ts
import {
  meterRelativeExposure,
  parseExposureMeteringProfile,
  resolveCaptureGeometry
} from "@photivra/engine";

const captureGeometry =
  resolveCaptureGeometry({
    imagingArea: {
      widthMm: 36,
      heightMm: 24
    },
    nativeRaster: {
      pixelWidth: 6000,
      pixelHeight: 4000
    },
    orientation: "landscape"
  }).value;

const profile =
  parseExposureMeteringProfile({
    schemaVersion: "0.1.0",
    profileId: "generic-relative-meter",
    scientificStatus: "approximation",
    inputDomain:
      "relative-pre-exposure-linear-signal",
    captureRegion:
      "oriented-active-capture",
    policy: {
      kind: "multi-zone-uniform"
    },
    target: {
      kind:
        "relative-signal-reference",
      targetRelativeSignal: 1,
      evidence: [
        {
          sourceOrigin: "photivra",
          sourceReference:
            "meter-target:example",
          reuseStatus:
            "photivra-owned"
        }
      ]
    },
    evidence: [
      {
        sourceOrigin: "photivra",
        sourceReference:
          "meter-profile:example",
        reuseStatus:
          "photivra-owned"
      }
    ],
    limitations: [
      "Generic educational relative meter."
    ]
  });

const metered =
  meterRelativeExposure({
    profile,
    sampleSet: {
      measurementId: "frame-42-meter",
      sceneStateId:
        "scene-state-after-light-change",
      inputDomain:
        "relative-pre-exposure-linear-signal",
      captureRegion:
        "oriented-active-capture",
      captureGeometry,
      processingState: {
        exposureSettingsApplied: false,
        whiteBalanceApplied: false,
        toneMappingApplied: false,
        displayGammaApplied: false,
        sharpeningApplied: false
      },
      samples: [
        {
          sampleId: "zone-0",
          positionOrientedCaptureUv: {
            u: 0.25,
            v: 0.5
          },
          relativeLinearSignal: 0.5,
          areaWeight: 1
        },
        {
          sampleId: "zone-1",
          positionOrientedCaptureUv: {
            u: 0.75,
            v: 0.5
          },
          relativeLinearSignal: 0.5,
          areaWeight: 1
        }
      ]
    }
  });

if (metered.value.status === "resolved") {
  console.log(
    metered.value
      .exposureOffsetStopsToTarget
  ); // 1
}
```

For a controlled uniform fixture, halving every relative-linear sample from `1.0` to `0.5` produces a **+1 stop** shift to the same declared target. That is the intended educational invariant used by future Manual + Auto ISO tests.

### Metering policies

The first generic policies are explicit rather than branded:

- `multi-zone-uniform` — area-weighted average over all supplied zones;
- `center-weighted-radial` — multiplies area weight by a radial physical-frame weighting function with explicit edge weight and exponent;
- `spot` — selects samples inside an explicit spot center/radius in the oriented active capture frame;
- `highlight-weighted` — gives brighter relative-linear samples more weight through an explicit exponent and minimum weight fraction.

The sample producer supplies `areaWeight`, so denser sampling in one part of the frame does not automatically mean more metering influence.

Center/spot distance is evaluated using the **physical dimensions of the oriented active capture frame**, not CSS/display pixels. A final output crop is not used by schema 0.1.0.

### Target and downstream control

`targetRelativeSignal` is a profile-defined reference. It is not a universal claim about 18% gray or a specific manufacturer's meter calibration.

The meter reports the base scene measurement independently from exposure compensation. It does not choose aperture, shutter duration, or ISO.

The intended flow is:

```text
pre-exposure relative scene signal
  -> meterRelativeExposure()
  -> base meter result / stop offset
  -> future exposure compensation
  -> #99 exposure-mode resolver
  -> aperture / shutter / ISO
```

A zero-signal sample set returns `status: "no-signal"` rather than infinity/NaN.

`measurementId` and `sceneStateId` remain in the result so a future application can freeze a meter result for AE lock or reject stale results after scene-light changes.

The input must explicitly state that exposure settings, white balance, tone mapping, display gamma, and sharpening have not already been applied. This prevents a circular final-preview auto-exposure loop.

This first slice is ambient/relative metering only. Flash/TTL metering, calibrated photometric/radiometric metering, exposure compensation application, and automatic mode resolution remain separate work.

## Scene-radiance-derived and temporal metering

Use `createSceneRadianceDerivedExposureMeteringSampleSet()` when a renderer/reference evaluator supplies relative pre-exposure meter zones derived from the #85 scene-radiance context.

The bridge validates:

- scene/provider/illumination/material profile identity;
- provider material fidelity against the supplied material profile;
- the declared scalar-reduction derivation profile;
- optional temporal-illumination profile identity;
- explicit capture time when the provider is time-varying.

The scalar reduction remains renderer/provider supplied. Photivra does **not** turn one or more spectral-radiance samples into luminance or a camera meter signal automatically.

```ts
import {
  createSceneRadianceDerivedExposureMeteringSampleSet,
  meterRelativeExposure,
  parseSceneRadianceMeteringDerivationProfile
} from "@photivra/engine";

const derivation =
  parseSceneRadianceMeteringDerivationProfile({
    schemaVersion: "0.1.0",
    derivationId: "preview-relative-meter",
    scientificStatus: "approximation",
    method:
      "renderer-provided-pre-exposure-relative-reduction",
    spectralWeighting:
      "not-calibrated",
    evidence: [
      {
        sourceOrigin: "photivra",
        sourceReference:
          "meter-derivation:preview",
        reuseStatus:
          "photivra-owned"
      }
    ],
    limitation:
      "Relative scalar reduction; no calibrated meter spectral response."
  });

const sampleSet =
  createSceneRadianceDerivedExposureMeteringSampleSet({
    measurementId: "meter-frame-1",
    sceneStateId: "scene-state-42",
    providerProfile,
    illuminationProfile,
    materialResponseProfile,
    captureGeometry,
    derivationProfile: derivation,
    samples: [
      {
        sampleId: "zone-0",
        positionOrientedCaptureUv: {
          u: 0.5,
          v: 0.5
        },
        relativeLinearSignal: 0.5,
        areaWeight: 1
      }
    ]
  });

const meter = meterRelativeExposure({
  profile,
  sampleSet
});
```

The source context reports `spectralReductionCalibrated: false`, and calibrated luminance/scene-radiance claims remain unauthorized.

### Time-varying illumination

If the scene-radiance provider declares `illuminationTemporalProfileId`, the bridge requires the matching temporal profile plus a finite `captureTimeSecondsFromReference` on the shared `first-opening-boundary-phase` reference.

One such sample set is an explicit instantaneous meter snapshot at that time.

To average multiple snapshots, use `meterSceneRadianceTemporalExposure()` with an explicit `weighted-time-average` policy:

```ts
import {
  meterSceneRadianceTemporalExposure
} from "@photivra/engine";

const temporalMeter =
  meterSceneRadianceTemporalExposure({
    temporalMeasurementId:
      "meter-window-1",
    profile,
    policy: {
      kind: "weighted-time-average",
      timeReference:
        "first-opening-boundary-phase"
    },
    temporalSamples: [
      {
        normalizedTimeWeight: 0.5,
        sampleSet: sampleAtTime0
      },
      {
        normalizedTimeWeight: 0.5,
        sampleSet: sampleAtTime1
      }
    ]
  });
```

The temporal weights must be positive and sum to one. Capture times must be strictly increasing. Every sample must share the same committed `sceneStateId`, provider/material/derivation context, temporal profile and active-capture geometry.

The meter averages **linear relative signals first**, then computes the stop offset to the target. It never averages EV/stop offsets.

This policy is explicit ambient temporal metering. It does not infer time weights from source flicker frequency, source waveform shape, shutter/readout duration, renderer frame cadence, or final display brightness. Flash/TTL metering remains separate.

## Generic equipment exposure capabilities

Use the #109 equipment-capability API to describe **what a generic Photivra body and lens allow** before #99 chooses any setting.

```ts
import {
  parseGenericBodyExposureCapabilityProfile,
  parseGenericLensExposureCapabilityProfile,
  resolveGenericEquipmentExposureCapabilities
} from "@photivra/engine";

const body =
  parseGenericBodyExposureCapabilityProfile({
    schemaVersion: "0.1.0",
    profileId: "body-prosumer",
    profileVersion: "1.0.0",
    scientificStatus: "approximation",
    evidence: [
      {
        sourceOrigin: "photivra",
        sourceReference:
          "generic-body:prosumer",
        reuseStatus: "photivra-owned"
      }
    ],
    shutter: {
      durationSecondsRange: {
        value: {
          minimum: 1 / 8000,
          maximum: 30
        },
        evidence: [
          {
            sourceOrigin: "photivra",
            sourceReference:
              "generic-body:prosumer:shutter",
            reuseStatus:
              "photivra-owned"
          }
        ]
      },
      settingGrid: {
        kind: "continuous-within-range"
      }
    },
    iso: {
      range: {
        value: {
          minimum: 100,
          maximum: 12800
        },
        evidence: [
          {
            sourceOrigin: "photivra",
            sourceReference:
              "generic-body:prosumer:iso",
            reuseStatus:
              "photivra-owned"
          }
        ]
      },
      settingGrid: {
        kind: "discrete-values",
        values: {
          value: [
            100,
            200,
            400,
            800,
            1600,
            3200,
            6400,
            12800
          ],
          evidence: [
            {
              sourceOrigin: "photivra",
              sourceReference:
                "generic-body:prosumer:iso-grid",
              reuseStatus:
                "photivra-owned"
            }
          ]
        }
      },
      autoIso: {
        value: "supported",
        evidence: [
          {
            sourceOrigin: "photivra",
            sourceReference:
              "generic-body:prosumer:auto-iso",
            reuseStatus:
              "photivra-owned"
          }
        ]
      }
    }
  });

const lens =
  parseGenericLensExposureCapabilityProfile({
    schemaVersion: "0.1.0",
    profileId: "lens-standard-variable-zoom",
    profileVersion: "1.0.0",
    scientificStatus: "approximation",
    evidence: [
      {
        sourceOrigin: "photivra",
        sourceReference:
          "generic-lens:standard-variable-zoom",
        reuseStatus: "photivra-owned"
      }
    ],
    focalLengthMmRange: {
      value: {
        minimum: 24,
        maximum: 70
      },
      evidence: [
        {
          sourceOrigin: "photivra",
          sourceReference:
            "generic-lens:focal-range",
          reuseStatus:
            "photivra-owned"
        }
      ]
    },
    aperture: {
      widestAvailableFNumber: {
        kind:
          "piecewise-linear-by-focal-length",
        samples: {
          value: [
            {
              focalLengthMm: 24,
              fNumber: 2.8
            },
            {
              focalLengthMm: 50,
              fNumber: 3.5
            },
            {
              focalLengthMm: 70,
              fNumber: 4
            }
          ],
          evidence: [
            {
              sourceOrigin: "photivra",
              sourceReference:
                "generic-lens:wide-open-curve",
              reuseStatus:
                "photivra-owned"
            }
          ]
        }
      },
      narrowestAvailableFNumber: {
        value: 22,
        evidence: [
          {
            sourceOrigin: "photivra",
            sourceReference:
              "generic-lens:narrowest-aperture",
            reuseStatus:
              "photivra-owned"
          }
        ]
      },
      settingGrid: {
        kind: "continuous-within-range"
      }
    }
  });

const capabilities =
  resolveGenericEquipmentExposureCapabilities({
    bodyProfile: body,
    lensProfile: lens,
    selectedFocalLengthMm: 60
  });
```

The resolved result contains the exposure envelope that #99 may later consume:

- focal-length-specific widest available f-number;
- narrowest available f-number;
- aperture setting grid;
- shortest/longest shutter duration and setting grid;
- ISO range and setting grid;
- Auto ISO availability.

### Continuous versus discrete setting grids

A setting grid is either:

- `continuous-within-range` — a downstream resolver may choose any finite value inside the range; or
- `discrete-values` — only the declared values are valid.

For a variable-aperture lens, the discrete aperture list is filtered after the wide-open f-number is resolved at the selected focal length.

### Capability versus selected state

These profiles do **not** represent the current camera settings. They are immutable capability inputs.

The resolver also does not choose aperture, shutter or ISO. #99 owns:

- manual versus automatic axis policy;
- validation/quantization of requested settings;
- clamping to capability limits;
- residual exposure diagnostics.

The legacy `CameraConfiguration` remains semantically unchanged while #109 builds the newer versioned capability/state architecture.

Auto ISO capability preserves three states:

- `supported`;
- `unsupported`;
- `unknown`.

An unknown capability must not be treated as supported.

ISO capability is control metadata only. It does not imply sensor noise, analog gain topology, photon count, conversion gain or high-ISO quality.

Likewise, shutter-duration capability does not imply shutter mechanism, rolling/global readout, exposure-boundary timing or flash sync.

## Meter target and exposure compensation

Use `createExposureMeterTargetFromMeteringResult()` to freeze a spatial or temporal metering result into the stable target consumed by #99.

```ts
import {
  createExposureMeterTargetFromMeteringResult,
  setExposureCompensationOnMeterTarget
} from "@photivra/engine";

const baseTarget =
  createExposureMeterTargetFromMeteringResult({
    targetId: "meter-target:frame-42",
    meterResult
  });

const compensated =
  setExposureCompensationOnMeterTarget({
    targetId: "meter-target:frame-42:+1ev",
    baseTarget,
    exposureCompensationStops: 1
  });
```

The frozen target copies the authoritative meter identity by value:

- source kind (spatial or temporal metering);
- measurement ID;
- scene-state ID;
- metering-profile ID.

This is the AE-lock seam. Holding the target object intentionally preserves the earlier meter snapshot even if the live scene later changes.

### Compensation semantics

Exposure compensation is an **absolute downstream target offset**.

For a resolved target:

```text
compensated stops =
  uncompensated meter stops
  + exposure compensation

compensated exposure scale =
  uncompensated meter scale
  * 2^(exposure compensation stops)
```

Therefore +1 EV compensation requests twice the exposure of the uncompensated target; -1 EV requests half.

`setExposureCompensationOnMeterTarget()` always re-derives from the stored uncompensated base values. Passing an already compensated target with a new compensation value does not compound the old compensation. This avoids control drift during repeated slider/dial updates.

A changed compensation state requires a new `targetId`. The source meter snapshot identity remains unchanged.

The meter measurement itself is never mutated, and the target still reports `automaticExposureResolved: false`. #99 owns the later aperture/shutter/ISO decision.

A no-signal meter target remains `no-signal` after compensation. The engine does not convert darkness into infinity or fabricate a reachable automatic exposure.

## Manual and Auto ISO exposure resolution

Use `resolveManualExposureMode()` for the first #99 exposure-control slice.

This resolver consumes:

- a frozen #100 `ExposureMeterTarget`;
- the resolved #109 generic body+lens exposure capabilities;
- an explicit relative reference exposure anchor;
- caller-owned aperture and shutter settings;
- either manual ISO or Auto ISO.

The resolver does **not** meter the scene, apply exposure compensation, change aperture/shutter, or infer sensor noise/gain behavior.

### Reference exposure anchor

The relative meter target tells the resolver how much exposure change is required, but it does not by itself define an absolute ISO.

Therefore this API requires:

```ts
const referenceExposure = {
  aperture: 4,
  shutterSeconds: 1 / 125,
  iso: 100
};
```

The anchor means: when the target scale is `1`, this aperture/shutter/ISO combination represents the declared relative exposure baseline.

It is explicit input, not a universal ISO-100 or gray-card rule. All three anchor values must be valid in the same resolved equipment capability envelope.

### Manual + Auto ISO

```ts
import {
  resolveManualExposureMode
} from "@photivra/engine";

const resolved =
  resolveManualExposureMode({
    target,
    capabilities,
    referenceExposure: {
      aperture: 4,
      shutterSeconds: 1 / 125,
      iso: 100
    },
    manualAperture: 4,
    manualShutterSeconds: 1 / 125,
    isoControl: {
      kind: "automatic",
      quantizationPolicy:
        "nearest-log2-lower-on-tie"
    }
  });
```

With aperture/shutter fixed at the reference values:

- target scale `1` resolves ISO 100;
- target scale `2` resolves ideal ISO 200;
- target scale `4` resolves ideal ISO 400.

This is the controlled invariant used for live scene-light response: a uniform -1 stop scene-light change produces +1 stop of ideal ISO when limits/grid permit it.

If manual optical settings differ from the reference, the resolver compensates only through ISO:

```text
manual optical factor =
  (manual shutter / manual aperture^2)
  /
  (reference shutter / reference aperture^2)

ideal Auto ISO =
  reference ISO
  * target exposure scale
  / manual optical factor
```

### Discrete ISO quantization

For a discrete #109 ISO grid, the first policy chooses the nearest valid ISO in log2 exposure space.

On an exact midpoint tie, the lower ISO is selected.

The result keeps these concepts separate:

- `idealIsoBeforeConstraints`;
- final resolved ISO;
- whether quantization occurred;
- whether ISO was clamped at minimum/maximum;
- signed residual exposure error.

Residual sign:

- positive residual = still **under target** / needs more exposure;
- negative residual = **over target** / needs less exposure;
- zero = matched.

The limiting constraint is reported as one of:

- `none`;
- `iso-minimum`;
- `iso-maximum`;
- `iso-grid-quantization`.

If Auto ISO capability is `unsupported` or `unknown`, the resolver returns a blocked result. Unknown is not treated as supported.

A `no-signal` meter target also blocks Auto ISO rather than selecting maximum ISO or infinity.

### Manual ISO

Use:

```ts
const resolved =
  resolveManualExposureMode({
    target,
    capabilities,
    referenceExposure,
    manualAperture: 4,
    manualShutterSeconds: 1 / 125,
    isoControl: {
      kind: "manual",
      iso: 400
    }
  });
```

Manual aperture, shutter, and ISO are preserved exactly after capability validation.

A changed meter target or exposure compensation changes only the target-residual diagnostic. It does not change any manual setting.

This is intentionally different from Manual + Auto ISO.

### Boundaries

The current #99 resolver foundation does not yet implement:

- Aperture Priority + Auto ISO;
- Shutter Priority;
- Program Auto;
- Full Auto exposure;
- minimum-shutter Auto ISO policy;
- safety shift;
- Bulb/Time control behavior;
- flash-aware exposure;
- sensor noise or conversion-gain behavior.

Those later modes should reuse the same target/capability/reference-control contracts rather than introduce separate exposure equations.

## Aperture Priority with manual ISO

Use `resolveAperturePriorityExposureMode()` when aperture and ISO are caller-selected and shutter is the only automatic exposure axis.

```ts
import {
  resolveAperturePriorityExposureMode
} from "@photivra/engine";

const resolved =
  resolveAperturePriorityExposureMode({
    target,
    capabilities,
    referenceExposure: {
      aperture: 4,
      shutterSeconds: 1 / 125,
      iso: 100
    },
    manualAperture: 5.6,
    manualIso: 200,
    shutterQuantizationPolicy:
      "nearest-log2-shorter-on-tie"
  });
```

This mode uses the same relative target/reference model as Manual + Auto ISO. It does not introduce an Aperture-Priority-specific exposure equation.

The ideal shutter is:

```text
fixed-axis factor at reference shutter =
  (reference aperture^2 / manual aperture^2)
  * (manual ISO / reference ISO)

ideal shutter =
  reference shutter
  * target exposure scale
  / fixed-axis factor
```

Aperture and ISO are validated against the same resolved #109 capability envelope and then preserved exactly.

### Shutter capability and quantization

For a continuous shutter grid, an in-range ideal duration is used directly.

For a discrete shutter grid, the first policy chooses the nearest duration in log2 exposure-time space. On an exact tie, the **shorter duration** is selected.

The result reports:

- `idealShutterSecondsBeforeConstraints`;
- resolved shutter duration;
- continuous/discrete grid kind;
- whether quantization occurred;
- whether the result was clamped at the shortest/longest duration;
- signed residual exposure error.

Limiting constraints are:

- `none`;
- `shutter-minimum`;
- `shutter-maximum`;
- `shutter-grid-quantization`.

Residual sign is shared with the Manual resolver:

- positive residual = still under target / needs more exposure;
- negative residual = over target / needs less exposure;
- zero = matched.

### Exposure compensation and no-signal

Exposure compensation is already encoded in the #100 target. Aperture Priority consumes that target and does not apply compensation again.

A no-signal target blocks automatic shutter resolution. The engine does not select the longest shutter or an infinite duration.

### Boundaries

This slice intentionally keeps ISO manual.

Aperture Priority + Auto ISO is later work because two automatic axes require an explicit selection policy such as a minimum-shutter rule. The engine must not assume ISO always moves before or after shutter.

Flash-aware shutter restrictions, safety shift, and manufacturer-specific program behavior also remain separate.

## Priority modes with Auto ISO

The larger #99 priority group adds the remaining A/S combinations before Program/Full Auto.

### Aperture Priority + Auto ISO

Use `resolveAperturePriorityAutoIsoExposureMode()` with an explicit two-auto-axis policy:

```ts
const resolved =
  resolveAperturePriorityAutoIsoExposureMode({
    target,
    capabilities,
    referenceExposure,
    manualAperture: 4,
    policy: {
      kind:
        "minimum-iso-until-slowest-preferred-shutter",
      isoBaseline:
        "minimum-selectable",
      isoQuantizationPolicy:
        "nearest-log2-lower-on-tie",
      slowestPreferredShutterSeconds:
        1 / 60,
      shutterSelectionPolicy:
        "not-longer-than-target",
      afterMaximumIso:
        "allow-slower-shutter"
    }
  });
```

The policy is explicit:

1. Start at the lowest selectable ISO.
2. Resolve shutter, but do not go slower than the declared preferred threshold.
3. If more exposure is required, hold that shutter region and raise ISO.
4. If ISO reaches its maximum while the target is still underexposed, the policy explicitly chooses either:
   - `allow-slower-shutter`; or
   - `hold-preferred-shutter` and return residual underexposure.

For discrete shutter grids, the pre-ISO shutter selection is never longer than the requested/preferred duration. This prevents a quantization choice from requiring an ISO below the supported minimum to undo overexposure.

### Shutter Priority + manual ISO

Use `resolveShutterPriorityExposureMode()` with manual ISO:

```ts
const resolved =
  resolveShutterPriorityExposureMode({
    target,
    capabilities,
    referenceExposure,
    manualShutterSeconds: 1 / 500,
    isoControl: {
      kind: "manual",
      iso: 400,
      apertureQuantizationPolicy:
        "nearest-log2-narrower-on-tie"
    }
  });
```

Shutter and ISO remain fixed. Aperture alone resolves.

Continuous aperture capability uses the ideal f-number directly. Discrete aperture grids choose the nearest log2 f-number, with the narrower aperture on an exact tie.

### Shutter Priority + Auto ISO

Use an aperture-first Auto ISO policy:

```ts
const resolved =
  resolveShutterPriorityExposureMode({
    target,
    capabilities,
    referenceExposure,
    manualShutterSeconds: 1 / 500,
    isoControl: {
      kind: "automatic",
      policy: {
        kind:
          "minimum-iso-aperture-first",
        isoBaseline:
          "minimum-selectable",
        isoQuantizationPolicy:
          "nearest-log2-lower-on-tie",
        apertureSelectionPolicy:
          "not-wider-than-target"
      }
    }
  });
```

This policy:

1. starts at the lowest selectable ISO;
2. resolves aperture first;
3. for a discrete aperture grid, chooses an aperture no wider than the ideal;
4. uses Auto ISO to fill the remaining exposure.

That direction is deliberate: choosing an aperture wider than the ideal at minimum ISO could overexpose while leaving no lower ISO available to compensate.

### Shared boundaries

These are control policies over the same relative exposure equation. They do not create new optics/sensor physics.

All modes:

- consume the already-compensated #100 target;
- consume the resolved #109 capability envelope;
- use the explicit reference exposure anchor;
- preserve residual-stop sign conventions;
- do not infer ISO noise/gain topology;
- do not apply flash policy or safety shift.

Program Auto, Full Auto exposure, Bulb/Time, flash-aware behavior, and named-camera program lines remain later work.

## Program Auto and Full Auto exposure

Program Auto and Full Auto exposure both require a declared, versioned **program line**. The engine does not invent a unique "correct" aperture/shutter pair.

### Generic program line

Use `parseExposureProgramLineProfile()`:

```ts
import {
  parseExposureProgramLineProfile
} from "@photivra/engine";

const programLine =
  parseExposureProgramLineProfile({
    schemaVersion: "0.1.0",
    profileId: "balanced-line",
    profileVersion: "1.0.0",
    scientificStatus: "approximation",
    policyKind:
      "generic-program-line",
    interpolation:
      "log2-aperture-shutter",
    evidence: [
      {
        sourceOrigin: "photivra",
        sourceReference:
          "program-line:balanced",
        reuseStatus:
          "photivra-owned"
      }
    ],
    limitations: [
      "Generic educational policy."
    ],
    nodes: [
      {
        nodeId: "minus-two",
        opticalExposureStopsFromReference:
          -2,
        aperture: 8,
        shutterSeconds: 1 / 125
      },
      {
        nodeId: "zero",
        opticalExposureStopsFromReference:
          0,
        aperture: 4,
        shutterSeconds: 1 / 125
      },
      {
        nodeId: "plus-two",
        opticalExposureStopsFromReference:
          2,
        aperture: 4,
        shutterSeconds: 4 / 125
      }
    ]
  });
```

Each node's declared stop coordinate must match its aperture/shutter optical exposure relative to the same `referenceExposure` supplied to #99. Nodes outside the resolved #109 aperture/shutter envelope fail closed.

Between nodes, aperture and shutter interpolate in log2 space. This keeps optical exposure stops linear across the segment before equipment quantization.

### Program Auto with manual ISO

```ts
const resolved =
  resolveProgramAutoExposureMode({
    target,
    capabilities,
    referenceExposure,
    programLine,
    isoControl: {
      kind: "manual",
      iso: 100
    }
  });
```

Aperture and shutter are automatic; ISO is preserved exactly after capability validation.

If the target falls beyond the first/last program-line node, the line clamps to the endpoint and the result reports residual under/over-exposure.

### Program Auto with Auto ISO

```ts
const resolved =
  resolveProgramAutoExposureMode({
    target,
    capabilities,
    referenceExposure,
    programLine,
    isoControl: {
      kind: "automatic",
      isoBaseline:
        "minimum-selectable",
      isoQuantizationPolicy:
        "nearest-log2-lower-on-tie"
    }
  });
```

The program line is first evaluated at the minimum selectable ISO. Auto ISO then fills any remaining exposure caused by:

- a target beyond the line endpoint;
- aperture/shutter quantization;
- capability clamping.

If the program line produces too much exposure even at minimum ISO, ISO clamps at minimum and the residual remains visible.

### Full Auto exposure

```ts
const resolved =
  resolveFullAutoExposureMode({
    target,
    capabilities,
    referenceExposure,
    policy: {
      kind:
        "generic-program-line-minimum-iso",
      programLine,
      isoBaseline:
        "minimum-selectable",
      isoQuantizationPolicy:
        "nearest-log2-lower-on-tie"
    }
  });
```

Full Auto **exposure** resolves aperture, shutter, and ISO only.

It explicitly does **not** resolve:

- autofocus;
- white balance;
- flash;
- drive mode;
- scene recognition;
- stabilization policy.

Those fields remain false in the result so the private app cannot accidentally treat this engine mode as whole-camera automation.

### Program/Full Auto consistency

Given the same:

- #100 exposure target;
- #109 equipment capabilities;
- reference exposure;
- program line;
- Auto ISO policy;

Program Auto + Auto ISO and Full Auto exposure should resolve identical aperture/shutter/ISO values.

Only the control-mode identity differs.

### Boundaries

Program lines are product policy approximations, not physical laws. Generic lines must not be described as reproducing a specific manufacturer unless exact evidence supports that claim.

Flash-aware program changes, safety shift, Bulb/Time behavior, and broader Full Auto camera decisions remain separate work.

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

## Capture rotation exposure trajectories

Use `calculateCaptureRotationTrajectories()` when you need to evaluate **pure camera rotation over each native point's local exposure interval** while preserving the separation between shutter/exposure timing and sensor readout:

```ts
import { calculateCaptureRotationTrajectories } from "@photivra/engine";

const trajectories = calculateCaptureRotationTrajectories({
  imagingArea: { widthMm: 36, heightMm: 24 },
  nativeRaster: { pixelWidth: 6000, pixelHeight: 4000 },
  shutterMechanism: "electronic",
  nominalExposureDurationSeconds: {
    value: 1 / 1000,
    unit: "s",
    evidence: [
      {
        sourceOrigin: "photivra",
        sourceReference: "capture-config:example",
        reuseStatus: "photivra-owned"
      }
    ]
  },
  opening: {
    kind: "uniform-linear-native-scan",
    directionNative: {
      value: "top-to-bottom",
      evidence: [
        {
          sourceOrigin: "photivra",
          sourceReference: "timing-profile:opening-direction",
          reuseStatus: "photivra-owned"
        }
      ]
    },
    traversalDurationSeconds: {
      value: 0.015,
      unit: "s",
      evidence: [
        {
          sourceOrigin: "photivra",
          sourceReference: "timing-profile:opening-traversal",
          reuseStatus: "photivra-owned"
        }
      ]
    }
  },
  closing: {
    kind: "uniform-linear-native-scan",
    directionNative: {
      value: "top-to-bottom",
      evidence: [
        {
          sourceOrigin: "photivra",
          sourceReference: "timing-profile:closing-direction",
          reuseStatus: "photivra-owned"
        }
      ]
    },
    traversalDurationSeconds: {
      value: 0.015,
      unit: "s",
      evidence: [
        {
          sourceOrigin: "photivra",
          sourceReference: "timing-profile:closing-traversal",
          reuseStatus: "photivra-owned"
        }
      ]
    }
  },
  focalLengthMm: 50,
  angularVelocityRadPerSec: {
    pitch: 0,
    yaw: 0.1,
    roll: 0
  },
  samplePointsNative: [
    { x: 3000, y: 0 },
    { x: 3000, y: 2000 },
    { x: 3000, y: 4000 }
  ]
});

console.log(trajectories.value.samples);
```

The function maps each native point to the pre-orientation image plane at the capture reference time, then evaluates the existing `calculateCameraRotationImageMapping()` primitive at that point's local exposure start and end.

The explicit time reference is the **first opening-boundary phase**. For this composition only, that reference is bound to `t = 0` of the low-level rotation model. This does not redefine the standalone rotation API for other callers.

The returned trajectory is **forward temporal geometry for a stationary world ray**:

- `referenceImagePointMm` is the ray's image-plane position at the capture reference;
- `atLocalExposureStart` and `atLocalExposureEnd` are its mapped positions at the local window endpoints;
- `localExposureTrajectoryEndpointDeltaMm` is the chord between those endpoints.

The chord is not an integrated blur kernel. It also is not a renderer-ready rolling-shutter warp.

A capture-scan image mapping is location-dependent because capture time varies across the image. For the current pure-rotation model, destination-to-reference inversion is analytic once the destination location selects its local capture time. More general motion models may require additional solving and global-validity analysis. Finite-exposure rendering still requires integration over the full local interval rather than one endpoint or midpoint displacement.

`calculateSensorReadoutTiming()` is intentionally not an input. If a specific capture mode has a defensible relationship between electronic exposure timing and sensor readout timing, that relationship should be represented by a future explicit mode/link contract rather than assumed by this API.

The current trajectory model remains pure rotation only. It excludes camera translation/parallax, subject motion, rotating/deforming subjects, occlusion changes, panning intent, exposure integration, flash/flicker, shutter shock, and final rolling-shutter inverse warping.

## Capture rotation temporal quadrature

Use `calculateCaptureRotationTemporalQuadrature()` when a downstream renderer or reference evaluator needs deterministic pure-rotation geometry samples across each destination point's complete local exposure interval:

```ts
import { calculateCaptureRotationTemporalQuadrature } from "@photivra/engine";

const quadrature = calculateCaptureRotationTemporalQuadrature({
  imagingArea: { widthMm: 36, heightMm: 24 },
  nativeRaster: { pixelWidth: 6000, pixelHeight: 4000 },
  shutterMechanism: "electronic",
  nominalExposureDurationSeconds: {
    value: 1 / 1000,
    unit: "s",
    evidence: [
      {
        sourceOrigin: "photivra",
        sourceReference: "capture-config:example",
        reuseStatus: "photivra-owned"
      }
    ]
  },
  opening: {
    kind: "simultaneous"
  },
  closing: {
    kind: "simultaneous"
  },
  focalLengthMm: 50,
  angularVelocityRadPerSec: {
    pitch: 0,
    yaw: 0.1,
    roll: 0
  },
  orientation: "landscape",
  temporalSampleCount: 8,
  samplePointsNative: [{ x: 3000, y: 2000 }]
});

console.log(quadrature.value.points[0]?.nodes);
```

The first model uses deterministic uniform midpoint quadrature. With `N` samples, node phases are:

```text
phase_i = (i + 0.5) / N
```

Each phase is passed through `calculateCaptureRotationInverseMappings()`, so instantaneous destination-to-reference geometry remains defined by one existing public model.

Every node exposes two different temporal weights:

- `normalizedTimeWeight = 1 / N` for a downstream time-average under the declared uniform temporal-response approximation;
- `timeMeasureSeconds = localExposureDuration / N` for a downstream time integral.

Do not interchange them. The first is dimensionless; the second carries seconds. Neither includes shutter transmission, scene radiance, sensor response, photon conversion, vignetting, or other radiometric throughput.

Different sensor locations may have different local exposure start/end times. If opening and closing scans produce different local durations, `timeMeasureSeconds` therefore differs by destination point while the normalized average weights still sum to approximately one for each point.

This API returns **temporal geometry nodes and measures only**. It does not:

- fetch or sample scene radiance;
- average the reference coordinates;
- calculate a blur radius/kernel or PSF;
- resolve visibility/occlusion changes;
- apply sensor readout timing;
- apply flash/flicker or shutter-shock behavior;
- write or resample output pixels.

Averaging geometric coordinates is not equivalent to integrating radiance along moving rays.

Photivra also does not report a geometry-only integration-error estimate. Temporal image error depends on downstream radiance, visibility, texture/edge frequency, reconstruction, and the motion path. A reference renderer can compare increasing `temporalSampleCount` values in the radiance/output domain when convergence evidence is needed.

## Instantaneous capture rotation inverse mapping

Use `calculateCaptureRotationInverseMappings()` to map captured destination locations back to the **first-opening-boundary reference image** under pure camera rotation:

```ts
import {
  calculateCaptureRotationInverseMappings
} from "@photivra/engine";

const mapping = calculateCaptureRotationInverseMappings({
  imagingArea: { widthMm: 36, heightMm: 24 },
  nativeRaster: { pixelWidth: 6000, pixelHeight: 4000 },
  shutterMechanism: "electronic",
  nominalExposureDurationSeconds: {
    value: 1 / 1000,
    unit: "s",
    evidence: [
      {
        sourceOrigin: "photivra",
        sourceReference: "capture-config:example",
        reuseStatus: "photivra-owned"
      }
    ]
  },
  opening: {
    kind: "uniform-linear-native-scan",
    directionNative: {
      value: "top-to-bottom",
      evidence: [
        {
          sourceOrigin: "photivra",
          sourceReference: "timing-profile:opening-direction",
          reuseStatus: "photivra-owned"
        }
      ]
    },
    traversalDurationSeconds: {
      value: 0.015,
      unit: "s",
      evidence: [
        {
          sourceOrigin: "photivra",
          sourceReference: "timing-profile:opening-traversal",
          reuseStatus: "photivra-owned"
        }
      ]
    }
  },
  closing: {
    kind: "uniform-linear-native-scan",
    directionNative: {
      value: "top-to-bottom",
      evidence: [
        {
          sourceOrigin: "photivra",
          sourceReference: "timing-profile:closing-direction",
          reuseStatus: "photivra-owned"
        }
      ]
    },
    traversalDurationSeconds: {
      value: 0.015,
      unit: "s",
      evidence: [
        {
          sourceOrigin: "photivra",
          sourceReference: "timing-profile:closing-traversal",
          reuseStatus: "photivra-owned"
        }
      ]
    }
  },
  focalLengthMm: 50,
  angularVelocityRadPerSec: {
    pitch: 0,
    yaw: 0.1,
    roll: 0
  },
  localExposurePhase: 0.5,
  orientation: "landscape",
  samplePointsNative: [
    { x: 3000, y: 0 },
    { x: 3000, y: 2000 },
    { x: 3000, y: 4000 }
  ]
});

console.log(mapping.value.samples);
```

`localExposurePhase` is mandatory:

- `0` evaluates local exposure start;
- `0.5` evaluates the local temporal midpoint;
- `1` evaluates local exposure end.

Photivra does not choose a default phase because a finite exposure does not have one uniquely correct sharp geometry.

Each destination native point first selects its local exposure time. Under the current constant-axis pure-rotation model, the captured ray can then be rotated **analytically** back to the exposure-start reference frame with `calculateInverseCameraRotationImageMapping()`. No iterative/fixed-point solver or convergence tolerance is needed.

The result reports:

- destination native and ideal image-plane coordinates;
- the local exposure window and selected capture time;
- the corresponding reference image-plane ray;
- reference-minus-destination displacement in image-plane millimetres;
- equivalent continuous native effective-sample displacement;
- that displacement rotated into the requested physical capture orientation.

The mapping deliberately remains in the ideal pre-lens geometry stage. It does not apply radial distortion, lateral CA, PSF, output crop, or output resampling.

Reference rays are **not clamped** to the active source region. Camera motion can cause a valid captured destination to require reference-image data outside that region. A renderer must decide how to handle unavailable source coverage rather than silently clamping/stretching an edge.

This is an **instantaneous** mapping only. It is not a complete finite-exposure rolling/capture-scan image. Motion blur requires multiple temporal samples or another defensible integration method over each local exposure window, including an explicit exposure-weighting model if the weighting is not uniform.

Sensor data-readout timing is intentionally not part of this calculation. Capture exposure boundaries remain the authoritative timing input until a separate capture-mode/link contract establishes otherwise.

The current model is pure rotation only. Translation/parallax, subject motion, deformation, occlusion changes, global injectivity/fold analysis, flash/flicker, shutter shock, and finite-exposure integration remain outside this slice.

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

## Scene illumination source profiles

Use `parseSceneIlluminationProfile()` when illumination metadata crosses a renderer/integration boundary:

```ts
import { parseSceneIlluminationProfile } from "@photivra/engine";

const illumination = parseSceneIlluminationProfile({
  schemaVersion: "0.1.0",
  profileId: "studio-reference",
  sceneId: "studio",
  evidence: [
    {
      sourceOrigin: "photivra",
      sourceReference: "scene:studio-reference",
      reuseStatus: "photivra-owned"
    }
  ],
  sources: [
    {
      sourceId: "key",
      family: "area",
      enabled: true,
      geometry: {
        kind: "scene-object-binding",
        sceneObjectId: "key-panel"
      },
      magnitude: {
        kind: "relative-linear-scale",
        scale: 1,
        scientificStatus: "approximation",
        limitation: "Reference-render brightness only."
      },
      spectrum: {
        kind: "blackbody-temperature-approximation",
        temperatureKelvin: 3200,
        limitation: "Declared blackbody approximation."
      },
      temporalBehavior: {
        kind: "time-invariant"
      },
      evidence: [
        {
          sourceOrigin: "photivra",
          sourceReference: "scene:key-panel",
          reuseStatus: "photivra-owned"
        }
      ]
    }
  ]
});

console.log(illumination.sources[0]?.sourceId);
console.log(illumination.sceneRadianceCalculated); // false
```

The schema intentionally has no generic `intensity` field. Physical magnitude forms are source-specific:

- point sources may declare radiant intensity in W/sr;
- area sources may declare surface radiance in W/(m²·sr);
- directional sources may declare irradiance in W/m² at an explicit reference plane;
- spot and environment sources are relative-only in schema 0.1.0 until their angular/radiance-field semantics are modeled.

All source families may use an explicitly approximate relative linear scale. Turning a source off uses `enabled: false`; a zero physical/relative magnitude is not used as a hidden off state.

Spectrum representations are likewise explicit. Linear-sRGB is preview-only. A blackbody temperature is a declared blackbody approximation, not a universal CCT control. Continuous relative spectra require reusable-data provenance and do not become absolute spectral power/radiance merely because a physical broadband magnitude also exists.

Discrete sources may instead use `discrete-relative-lines`. Each line carries an explicit wavelength and a normalized **wavelength-integrated** line weight; line weights must sum to one and use a resolved air/vacuum wavelength basis. These values are not per-nanometre densities and are never assigned an arbitrary line width. `resolveSceneIlluminationDiscreteLineMeasure()` can distribute a source's integrated magnitude across those line fractions while preserving its source quantity unit.

The parser establishes illumination metadata only. It does not calculate material response, visibility, indirect transport, outgoing scene spectral radiance, sensor-plane irradiance, photons/electrons, fluorescence, volumetric spectral transport, or polarization.

See [Scene Radiance and Illumination](SCENE_RADIANCE_AND_ILLUMINATION.md).

## Scene-radiance provider and material response

Use the provider boundary when a renderer or reference evaluator needs to return one outgoing spectral-radiance sample without moving its rendering algorithm into the engine.

First define material-response metadata:

```ts
import {
  parseSceneMaterialResponseProfile
} from "@photivra/engine";

const materials = parseSceneMaterialResponseProfile({
  schemaVersion: "0.1.0",
  profileId: "room-materials",
  sceneId: "room",
  evidence: [
    {
      sourceOrigin: "photivra",
      sourceReference: "materials:room",
      reuseStatus: "photivra-owned"
    }
  ],
  materials: [
    {
      materialResponseId: "wall-preview",
      evidence: [
        {
          sourceOrigin: "photivra",
          sourceReference: "material:wall-preview",
          reuseStatus: "photivra-owned"
        }
      ],
      representation: {
        kind: "rgb-pbr-approximation",
        colorSpace: "linear-srgb",
        baseColor: {
          red: 0.2,
          green: 0.3,
          blue: 0.6
        },
        metallic: 0,
        roughness: 0.7,
        limitation:
          "RGB/PBR preview data is not measured spectral response."
      }
    }
  ],
  fluorescenceModeled: false,
  volumetricMaterialTransportModeled: false,
  polarizationModeled: false
});
```

Then declare the provider's fidelity and bindings:

```ts
import {
  parseSceneRadianceProviderProfile
} from "@photivra/engine";

const provider = parseSceneRadianceProviderProfile({
  schemaVersion: "0.1.0",
  profileId: "reference-renderer",
  sceneId: "room",
  illuminationProfileId: "room-lights",
  materialResponseProfileId: "room-materials",
  outputQuantity: "outgoing-spectral-radiance",
  outputUnit: "W/m^2/sr/nm",
  scientificStatus: "approximation",
  uncertainty: {
    kind: "not-quantified",
    limitation:
      "Renderer transport has not been calibrated as a complete radiance model."
  },
  fidelity: {
    spectral: "rgb-derived-approximation",
    material: "rgb-pbr-approximation",
    visibility: "resolved",
    directTransport: "resolved",
    indirectTransport: "approximation"
  },
  wavelengthChangingTransportModeled: false,
  volumetricTransportModeled: false,
  polarizationModeled: false,
  evidence: [
    {
      sourceOrigin: "photivra",
      sourceReference: "provider:reference-renderer",
      reuseStatus: "photivra-owned"
    }
  ],
  limitations: [
    "Fluorescence and polarization are not modeled."
  ]
});
```

An evaluation request identifies one exact surface/environment direction, physical time, and wavelength. The renderer/provider computes the radiance externally and returns a result in `W/m^2/sr/nm`. Parse both with `parseSceneRadianceEvaluationRequest()` and `parseSceneRadianceEvaluationResult()`, then call `validateSceneRadianceEvaluationBindings()` with the provider, illumination profile, material profile, request, and result.

The binding validator checks exact scene/profile/material/sample/wavelength identity and provider material-fidelity consistency. It **does not** recompute the renderer's numeric result, apply optics, calculate sensor-plane irradiance, or authorize photon output.

Provider/result schema 0.1.0 is approximation-only. Calibrated material or illumination inputs cannot silently promote provider output to calibrated scene radiance.

See [Scene Radiance and Illumination](SCENE_RADIANCE_AND_ILLUMINATION.md#scene-radiance-provider-and-material-response-boundary).

## Shared spectral composition

Use `composeSpectralCoverage()` when multiple **continuous** wavelength-dependent factors need one common coverage/breakpoint plan.

```ts
import {
  composeSpectralCoverage,
  createSensorSpectralCoverageParticipant
} from "@photivra/engine";

const sensorCoverage =
  createSensorSpectralCoverageParticipant({
    spectralResponseProfile,
    channelId: "green"
  });

const composition =
  composeSpectralCoverage({
    participants: [
      {
        participantId: "scene-radiance",
        role: "scene-radiance",
        wavelengthBasis: "vacuum",
        wavelengthRangeNanometers: {
          minimum: 420,
          maximum: 680
        },
        breakpointsNanometers: [
          500,
          600
        ]
      },
      {
        participantId: "lens-transmission",
        role: "optical-transmission",
        wavelengthBasis: "vacuum",
        wavelengthRangeNanometers: {
          minimum: 400,
          maximum: 700
        },
        breakpointsNanometers: [
          450,
          550,
          650
        ]
      },
      sensorCoverage
    ]
  });

console.log(
  composition
    .commonWavelengthRangeNanometers
);
console.log(
  composition
    .segmentBoundariesNanometers
);
```

The composition:

- requires all participants to use the same resolved air/vacuum wavelength basis;
- intersects their wavelength ranges;
- unions internal interpolation breakpoints inside that overlap;
- does not apply scene values, optical transmission, QE, or A/W responsivity;
- does not perform spectral integration or claim convergence.

Continuous illumination spectra can be converted to the same participant shape with `createSceneIlluminationSpectralCoverageParticipant()`. RGB, blackbody approximations, unresolved spectra, and discrete line spectra are rejected by that adapter.

### Discrete line measures

Discrete lines use a different integration path.

```ts
import {
  integrateDiscreteSpectralLineMeasure,
  resolveSceneIlluminationDiscreteLineMeasure
} from "@photivra/engine";

const lineSource =
  illumination.sources.find(
    (source) =>
      source.sourceId === "line-source"
  );

if (
  lineSource?.spectrum.kind ===
  "discrete-relative-lines"
) {
  const measure =
    resolveSceneIlluminationDiscreteLineMeasure(
      lineSource
    );

  const integrated =
    integrateDiscreteSpectralLineMeasure(
      measure.measure
    );

  console.log(
    integrated.integratedQuantity
  );
  console.log(
    integrated.quantityUnit
  );
}
```

A discrete line entry already represents an integrated wavelength contribution. Therefore line integration is:

```text
total = sum(line integrated quantities)
```

There is **no** `dλ` multiplication. Assigning an arbitrary width to a laser/line emitter merely to reuse continuous quadrature is invalid.

The source-level helper may distribute point radiant intensity (W/sr), area radiance (W/m²/sr), directional reference-plane irradiance (W/m²), or an explicitly relative magnitude across normalized line fractions. It does not apply material transport, optics, sensor response, photon conversion, or combined uncertainty, and it does not authorize a calibrated outgoing-radiance claim.

See [Scene Radiance and Illumination](SCENE_RADIANCE_AND_ILLUMINATION.md#shared-spectral-composition).

## Temporal illumination

Use `parseSceneIlluminationTemporalProfile()` to add explicit flash/flicker-style modulation to sources without changing the base illumination schema.

```ts
import {
  evaluateSceneIlluminationTemporalMultiplier,
  parseSceneIlluminationTemporalProfile
} from "@photivra/engine";

const temporal = parseSceneIlluminationTemporalProfile({
  schemaVersion: "0.1.0",
  profileId: "room-light-timing",
  sceneId: "room",
  illuminationProfileId: "room-lights",
  evidence: [
    {
      sourceOrigin: "photivra",
      sourceReference: "timing:room-lights",
      reuseStatus: "photivra-owned"
    }
  ],
  waveforms: [
    {
      waveformId: "flash-pulse",
      kind: "aperiodic-relative-multiplier",
      timeUnit: "s",
      scientificStatus: "approximation",
      uncertainty: {
        kind: "not-quantified",
        limitation: "Example waveform."
      },
      evidence: [
        {
          sourceOrigin: "photivra",
          sourceReference: "waveform:flash-pulse",
          reuseStatus: "photivra-owned"
        }
      ],
      interpolation: "piecewise-linear",
      outsideSupportBehavior: "zero",
      samples: [
        {
          timeSecondsFromWaveformReference: 0,
          relativeMagnitudeMultiplier: 0
        },
        {
          timeSecondsFromWaveformReference: 0.002,
          relativeMagnitudeMultiplier: 1
        },
        {
          timeSecondsFromWaveformReference: 0.006,
          relativeMagnitudeMultiplier: 0
        }
      ]
    }
  ],
  sourceBindings: [
    {
      bindingId: "key-flash-registration",
      sourceId: "key-flash",
      waveformId: "flash-pulse",
      captureTimeReference: "first-opening-boundary-phase",
      waveformTimeZeroSecondsFromCaptureReference: 0.001,
      scientificStatus: "approximation",
      timingUncertainty: {
        kind: "not-quantified",
        limitation: "Example registration."
      },
      evidence: [
        {
          sourceOrigin: "photivra",
          sourceReference: "registration:key-flash",
          reuseStatus: "photivra-owned"
        }
      ]
    }
  ]
});

const temporalSample =
  evaluateSceneIlluminationTemporalMultiplier({
    illuminationProfile,
    temporalProfile: temporal,
    sourceId: "key-flash",
    captureTimeSecondsFromReference: 0.003
  });

console.log(
  temporalSample
    .effectiveRelativeMagnitudeMultiplier
);
```

Waveform time is explicitly registered to seconds from the first opening-boundary phase. Sensor readout duration is not used as a substitute for exposure timing.

For finite exposure, use `integrateSceneIlluminationTemporalMultiplierOverExposureWindow()` with the authoritative `CaptureExposureWindows` result and one sample index. The integration uses deterministic midpoint quadrature over that local exposure window and returns average and seconds-integrated relative multipliers.

This layer does not apply the source's physical magnitude, evaluate material/visibility transport, calculate scene radiance, perform sensor response, or choose camera exposure settings.

A scene-radiance provider may optionally bind the temporal profile with `illuminationTemporalProfileId`. When declared, `validateSceneRadianceEvaluationBindings()` requires the matching temporal profile.

See [Scene Radiance and Illumination](SCENE_RADIANCE_AND_ILLUMINATION.md#temporal-illumination).

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

The POC staged `capture` geometry request deliberately keeps legacy `crop.factor` separate: it must remain `1` when `capture` is present. This geometry request is distinct from the sensor/capture-mode profile contract. Staged capture can use the existing `subjectCrop` request, but the result appears under `capture.subjectFraming` because it is a post-output framing stage rather than a legacy total-crop factor.

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
