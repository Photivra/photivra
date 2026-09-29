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
