# Image-Formation Contract

Release context: **package 1.1.0 candidate / root API 1.1.0**. Subsystem/model versions and dated introduction or measurement records below are independent historical identities; they are not distribution versions. See [developer navigation](DEVELOPERS.md) and [release contract](RELEASE_1_1_0.md).

Photivra's image-formation contract defines **scientific ownership, coordinate semantics, and dependency/coupling boundaries** for current and future camera effects.

It is not a claim that every stage is implemented, and it is not a requirement that renderers execute one literal serial filter chain.

Use:

```ts
import { getImageFormationContract } from "@photivra/engine";

const contract = getImageFormationContract();
```

## Six scientific domains

The contract groups image formation into six domains:

1. **scene / ray geometry**
2. **scene radiance formation**
3. **lens mapping + pupil / throughput**
4. **field- and wavelength-dependent PSF**
5. **time-dependent exposure / readout**
6. **native sensor sampling -> orientation -> output / display**

These are scientific ownership domains. Some effects couple more than one domain.

Examples:

- scene illumination, material optical response, geometry/visibility, emission, indirect transport, and time belong upstream in `scene-radiance-evaluation`; source metadata or RGB renderer values are not sensor input;
- focus breathing changes projection/magnification and therefore couples lens mapping to scene projection;
- lateral chromatic aberration is wavelength/channel-dependent field mapping and may share wavelength basis with the PSF model;
- illumination vignetting is throughput-only;
- mechanical/pupil vignetting can change both throughput and PSF/bokeh shape;
- diffraction consumes the effective pupil and belongs to the PSF domain;
- rolling readout couples native sensor timing to temporal integration;
- camera rotation should be evaluable as a function of physical exposure time so global and rolling readout can consume the same motion model.

## Scene-radiance ownership

`scene-radiance-evaluation` is a partial foundation between `scene-ray-projection` and `lens-field-pupil-evaluation`.

Its authoritative quantity is **outgoing scene spectral radiance** produced from illumination, scene geometry/visibility, material response, emission, indirect transport, and physical time. The renderer-neutral scene request/result boundary supplies declared radiance samples; the production composer validates a bound sample and consumes #110 optical throughput. It does not execute a complete scene renderer or establish a measured radiance field.

The existing `SceneRadiometry` metadata remains separate. `absolute-luminance` is a photometric luminance anchor, not a wavelength-resolved radiance field. Likewise, a light-source SPD, RGB HDR environment, source irradiance, and sensor-plane spectral irradiance are different quantities and must not be substituted for one another.

See [Scene Radiance and Illumination](SCENE_RADIANCE_AND_ILLUMINATION.md).

Shared spectral planning now distinguishes continuous support from discrete lines. Continuous scene/optics/sensor factors may share an explicit air/vacuum coverage intersection and breakpoint union. Delta-like line spectra remain wavelength-integrated measures and are summed without a dλ multiplier; they are never converted into synthetic continuous density merely to enter the continuous sensor quadrature path.

Time-varying illumination now uses a separate temporal profile. Source waveforms are relative multipliers evaluated in physical seconds and must be explicitly registered to the capture `first-opening-boundary-phase` reference before flash/flicker can participate in exposure integration. The local exposure window—not total sensor data-readout duration—defines the integration interval. The temporal foundation returns multiplier/time measures only; source magnitude, material/visibility transport, outgoing radiance, optics, sensor response, metering and automatic exposure remain downstream/separate.

## Coordinate spaces

The contract explicitly distinguishes:

- `scene-metric` — scene/world metric coordinates;
- `image-plane-metric` — optical-axis origin, +X right, +Y up, millimetres;
- `native-sensor-physical` — optical-axis origin, +X right, +Y down, millimetres;
- `native-raster` — top-left origin, +X right, +Y down, pixels;
- `oriented-capture-raster` — explicit physical-orientation transform of native raster coordinates;
- `output-raster` — digital crop/resampling result;
- `display` — consumer/display coordinates, which are never authoritative camera-science coordinates.

Native sensor/raster coordinates remain invariant under physical camera orientation.

Use `mapOrientedPhysicalUvToImagePlanePoint()` and
`mapImagePlanePointToOrientedPhysicalUv()` when a renderer or integration
boundary must cross between a normalized oriented physical raster region and
the pre-orientation `image-plane-metric` space. These transforms explicitly
undo/apply physical orientation and convert the capture contract's physical
+Y-down basis to/from the optical image plane's +Y-up basis. They do not apply
projection, distortion, crop, or lens equations, and asymmetric physical bounds
remain asymmetric.

## Partial ordering and coupling

`requiredUpstreamStages` defines hard scientific dependencies.

`coupledStages` identifies interactions that must not be treated as independent post-processes.

The required-dependency graph is acyclic. Coupling may be bidirectional because it describes shared scientific state rather than execution order.

An implementation may combine stages for performance only when the combination is mathematically equivalent and the public stage/effect semantics remain intact.

## PSF contribution foundation

The `field-wavelength-psf` stage has a dedicated public foundation documented in [PSF and Pupil Foundation](PSF_FOUNDATION.md).

Current implementation:
- geometric defocus-circle diagnostic;
- ideal circular-pupil Airy first-zero diagnostic;
- explicit field/depth/wavelength/pupil context.

Reserved contributions:
- non-circular diffraction;
- mechanical pupil clipping;
- field curvature;
- field-dependent aberration;
- field-dependent bokeh.

No combined PSF is currently calculated.

## Temporal basis

Physical time is measured in **seconds from exposure start**.

A normalized `[0,1]` shutter parameter may be derived for an algorithm, but it is not the authoritative time coordinate.

Exposure duration and sensor readout timing are independent:

- global readout does not mean zero motion blur;
- rolling readout changes when different native sensor locations are sampled/integrated;
- native readout direction remains defined in native sensor coordinates even when the camera is physically rotated.

This allows later rolling-shutter work to consume the same time-parameterized camera-motion model used for global exposure.

The standalone `calculateSensorReadoutTiming()` foundation now supplies an invariant native-raster spatial readout phase schedule. Its first model is a caller-declared uniform-linear single-axis approximation with independently evidenced data-readout duration and rolling spatial skew. It does not define exposure windows or shutter-curtain motion, and it does not infer physical hardware readout lines from the effective native image raster.

The additive `assessReadoutExposureTimingLinkage()` layer can validate an explicitly evidenced normalized spatial-phase relationship between rolling readout and an electronic exposure boundary. It never infers absolute temporal synchronization; total data-readout duration is not a surrogate for exposure timing, and matching direction/span alone is insufficient evidence of a shared clock.

The standalone `calculateCaptureExposureWindows()` foundation separately describes local opening/closing exposure boundaries. It uses the first opening-boundary phase as its explicit time reference, preserves independent nominal/opening/closing timing, validates positive local duration across the whole active rectangle, and keeps mechanical/EFCS/electronic actuator identity separate from timing. It does not automatically bind those exposure boundaries to sensor readout phase or to the existing camera-rotation time origin.

The standalone `calculateCaptureRotationTrajectories()` bridge now explicitly binds that first opening-boundary phase to `t = 0` of the existing pure-camera-rotation model and evaluates stationary reference rays at local exposure start/end. It remains forward temporal geometry only: it does not consume sensor readout timing, solve the implicit rolling-shutter image warp, or integrate motion blur over the exposure interval.

The additive `calculateCaptureRotationInverseMappings()` layer now supplies an instantaneous destination-to-reference mapping at a caller-selected phase within each local exposure window. Under the current pure-rotation model the inverse is analytic once destination location fixes local capture time, so no iterative solver is used. This remains pre-lens, pre-output temporal geometry and does not replace finite-exposure integration.

The additive `calculateCaptureRotationTemporalQuadrature()` layer now supplies deterministic uniform-midpoint time nodes and separate normalized-average/seconds-valued temporal measures across each local exposure. It preserves the instantaneous inverse mapping as the geometry source of truth but does not itself integrate radiance, visibility, shutter transmission, sensor response, PSF, or output pixels.

## Production composition consumer

The ownership graph is now consumed by a separate production-plan contract.

The production planner:

- expands required upstream stages from this graph;
- preserves coupled-stage metadata;
- never creates a second hidden stage order;
- records modeled-zero, omitted, unsupported, and blocked states explicitly;
- keeps renderer capability declaration separate from scientific stage ownership.

Current plan schema `0.7.0` supports the physical sample path, attached-RAW processing and the bounded [executed environment capture](PRODUCTION_ENVIRONMENT_CAPTURE.md). Complete declared environment input can execute all fourteen graph stages through RAW and optional output. Sample-only and attachment-only routes preserve their missing upstream blockers; temporal geometry alone does not integrate radiance. See [processed output](PROCESSED_OUTPUT.md) for the attachment boundary. See [V1 composition and consumer map](V1_COMPOSITION_MAP.md) for current consumers and required handoffs.

See [Production Image-Formation Plan](PRODUCTION_COMPOSITION.md).

## Renderer semantics

Renderer implementations may use a bounded real-time preview approximation or a higher-fidelity deterministic reference evaluation, but both must consume the same engine-owned scientific contract.

For geometric warps:

- destination samples are inverse-mapped to source locations;
- premultiplied-alpha semantics are preserved;
- scene depth/occlusion order is preserved across warps;
- renderer backend choice may change implementation/fidelity, not model semantics.

## Sensor ordering and standalone boundaries

The static ordering registry 0.4.0 retains broad foundation/reserved maturity labels; these are not route-specific capability checks. Plan 0.7.0 records actual bounded execution and blockers. The standalone layers below explain each primitive’s ownership and do not negate the separate executed environment route.

The contract owns this sensor ordering. Individual descriptive profiles do not execute the whole path; the bounded environment production route explicitly composes supported terms:

```text
optical PSF
  -> sensor optical stack (OLPF / cover glass / microlens)
  -> photosite / CFA sampling
  -> photon / charge statistics
  -> electronic read noise / conversion
  -> ADC / quantization
  -> reconstruction (demosaic / remosaic / capture-mode combination)
  -> physical orientation transform
  -> output crop / resampling
  -> display processing
```

Temporal exposure/readout couples into the photosite/charge stages rather than acting as an unrelated display blur.

The standalone capture-mode profile now describes acquisition sequence, per-frame effective sampling, optional inter-frame sensor offsets, reconstruction-stage labels, processed-image raster, and downstream dependencies. It does **not** implement the reserved CFA/photosite/reconstruction algorithms. A mode's processed raster remains upstream of physical orientation and final output crop/resampling and cannot redefine physical sensor geometry or FOV.

The standalone color-sampling topology profile now describes monochrome, arbitrary periodic mosaic phase/channel assignment, and layered color declarations with an explicitly unresolved spatial relationship. The periodic topology lives on a distinct native sensor sampling-site lattice rather than `NativeImageRaster`; no binding to effective image samples or physical photodiodes is inferred. This metadata foundation does not yet implement the reserved photosite/CFA sampling stage, spectral response, sparse site exceptions, RAW sampling, or reconstruction.

The additive native-effective-raster/color-site binding now provides the missing structural bridge between capture-mode effective samples and monochrome/periodic topology. It requires evidence for the exact native raster relationship and grouped-mode phase, preserves full-frame absolute CFA phase, and reports compact pre-reconstruction source regions/channel counts. This still does **not** implement the reserved photosite/CFA sampling stage: no signal weights, spectral response, photons/electrons, RAW values, aliasing, or reconstruction are calculated.

The standalone sensor optical-stack profile now makes the upstream stack boundary explicit without claiming a complete stack response. Ordered physical component roles and microlens presence are descriptive. Effective anti-aliasing response is separately modeled as unknown, absent, present-but-unresolved, or a normalized native-physical point-splitting approximation. The resolver exposes only that AA spatial term; cover/filter transmission/refraction, microlens angular/collection behavior, wavelength/field/polarization dependence, and convolution with the lens PSF remain future work. The profile alone is not a complete optical-stack simulation. The production environment route consumes the supported explicit spatial/response bindings and records approximation limits.

The standalone sensor sampling-aperture profile now supplies explicit native-physical registration for the color-site center lattice and a first geometric sensitive-region footprint. The rectangle is a normalized spatial-area averaging support plus a separately reported geometric area/fraction; it is **not** QE or radiometric collection efficiency. AA point splitting, microlens redirection, diffusion/crosstalk, spectral response, photons/electrons, and RAW values are still absent. This advances the geometry needed by the reserved `photosite-cfa-sampling` stage without claiming that stage is fully implemented.

The additive sensor spatial-quadrature layer now combines the resolved AA point-splitting term with the geometric aperture using deterministic native-physical midpoint nodes. AA is applied by inverse source lookup, the destination site's CFA channel remains fixed, and off-active-area pre-AA source support is preserved. The result is still a geometry/measure plan only: no optical field, spectral response, radiometry, temporal integration, RAW value, or reconstruction is calculated, so the `photosite-cfa-sampling` stage remains reserved.

The additive spatial-sample reducer can now apply those weights to caller-supplied nonnegative linear relative values or physical irradiance. It does not turn a channel ID into spectral filtering, does not integrate over time/wavelength, and does not calculate photons, electrons or RAW codes. Consequently this is still a pre-response site sample and the full `photosite-cfa-sampling` stage remains reserved.

The standalone sensor spectral-response profile now establishes explicit wavelength-dependent meaning for linked semantic channels. It can resolve effective external QE, effective A/W responsivity, or declared filter×detector-EQE at one wavelength while preserving response scope and reusable-data provenance. It performs no spectral irradiance integration, exposure-time integration, photon/electron conversion, or RAW reconstruction, so the complete `photosite-cfa-sampling` and downstream charge stages remain only partially founded/reserved.

The additive sensor spectral-quadrature plan supplies deterministic wavelength nodes and dλ measures without turning them into signal. Response knots and explicit caller breakpoints define segment boundaries, a maximum subinterval width bounds midpoint spacing, and the selected response scope/provenance remain visible. Sensor-response coverage is not treated as scene/optics coverage, response values are not applied, QE is not conflated with A/W responsivity, and continuous-density quadrature does not silently approximate discrete spectral lines.

The shared spectral-coverage layer can now derive the sensor channel's usable range and interpolation knots and combine them with separately declared scene/optics/material coverage. This is planning metadata only. Discrete illumination lines use a separate integrated-line measure path and are not accepted as additional continuous quadrature breakpoints.

The additive spatio-spectral reducer now performs the first explicit spatial × wavelength measure composition for caller-supplied sensor-plane E_lambda(x,y) in W/m²/nm. It requires exact color-profile/channel linkage, retains every required edge/off-frame spatial source sample, caps the Cartesian product, and produces pre-response wavelength-integrated irradiance plus geometric-aperture incident flux.

The additive response-application compatibility gate now checks whether that pre-response result is structurally eligible for a later spectral response. It requires exact response/color/aperture/stack linkage, source-plane compatibility with response scope, matching geometric-aperture normalization, explicit spatial response uniformity/separability, resolved wavelength basis, and compatible reference conditions or an explicit approximation. Full-site-cell and effective-collection-area normalizations remain blocked because the current reducer has not integrated those radiometric area bases.

The additive response operating-range gate evaluates optical input against an evidence-backed linearity range with explicit wavelength applicability, reference conditions, uncertainty and nonlinearity criterion. It distinguishes broadband-total evidence from per-spectral-bin applicability and requires an explicit maximum bin width for the latter. Wavelength-dependent response conversion is authorized only when each spectral bin and the spatially reduced aperture satisfy the declared linearity model. Exposure characteristic-curve linearity, accumulated-charge/full-well saturation, conversion gain, readout electronics and ADC linearity remain downstream temporal/electrical contracts.

The photon-energy wavelength foundation resolves the physical energy-per-photon basis used by EQE conversion. Vacuum wavelengths use exact SI h and c. Air wavelengths must first be converted to vacuum wavelength through a sourced phase refractive index at the exact wavelength, with explicit atmospheric-condition compatibility; no implicit air≈vacuum shortcut is allowed.

The EQE electron-rate foundation applies the photon-domain response conversion after all prior gates. It evaluates each wavelength-bin radiant-power contribution independently, divides by photon energy to obtain incident-photon rate, applies effective external QE through the authoritative spectral-response resolver, and sums expected generated-electron rates with compensated summation.

The sibling A/W responsivity foundation applies the current-domain response independently per wavelength bin and sums detector-terminal photocurrent magnitude. Its calibration is additionally bound to explicit detector bias and current-readout load conditions. This current is not treated as electron rate, accumulated charge, transimpedance voltage, or circuit-polarity truth.

Both paths still stop before exposure-time integration, accumulated-charge/full-well behavior, stochastic noise, analog electronics, ADC/RAW and reconstruction.

The local sensor-rate/exposure binding carries each engine-produced response rate back to its exact color-sampling site, through an evidenced one-to-one native-effective-raster relationship, and into the authoritative local shutter-window schedule. This establishes which local time interval belongs to that rate but deliberately does not assume the rate is constant through the interval.

The constant-rate temporal-integration foundation now permits rate × local-duration only under a stationarity declaration bound to the exact site/window. EQE rates produce fractional expected photon/electron counts; A/W current produces photocharge magnitude in coulombs without carrier inference.

The dark-current foundation adds pre-compensation thermally generated expected electrons to the EQE-side charge model using exact local exposure duration and explicit temperature applicability. It does not model black-level compensation, hot-pixel/defect excess, leakage/injection, dark-current nonuniformity unless separately evidenced, or dark-current shot-noise realization. A/W integrated charge is still not treated as stored pixel electrons.

The accumulated-charge completeness foundation combines photo, dark and explicitly incremental other stored-electron expectations only when all terms bind to one exact local exposure. Completeness is not inferred from missing components; an evidence-backed declaration must enumerate the supplied additional charge components and state that all material stored-electron contributors are accounted for.

The physical charge-capacity foundation compares the complete expected stored-electron total with an evidence-backed storage limit. It remains an expectation-domain assessment: no stochastic saturation probability, clamp, post-capacity charge, overflow amount, anti-blooming or neighbor redistribution is modeled.

The camera saturation-capacity foundation is separate: it compares dark-corrected photo-signal electron-equivalent expectation against a measured/calibrated camera response-chain capacity. Dark/other stored charge is not added to that signal-domain comparison, and physical full-well is not reused. The first camera-capacity contract does not identify whether analog electronics, ADC/digital clipping, or another stage is the actual limiter.

Stage-specific clipping transfer functions, stochastic noise, analog electronics, ADC/RAW and reconstruction remain downstream.

## Current implementation status

Each stage is labeled:

- `existing-foundation` — the root engine already contains the relevant foundation;
- `partial-foundation` — some low-level science exists, but the full stage contract is not implemented; spatial camera rotation in the temporal domain plus declared-scale focus breathing, radial distortion, RGB-channel lateral CA, and illumination throughput in the lens-field domain are current examples;
- `reserved-contract` — ordering/ownership is reserved for future work only.

Do not infer capabilities from a stage merely because it is present in the contract.

## Test Fixture relationship

External consumer fixtures may provide browser regression targets; engine implementation and independent conformance remain the scientific source of truth.

Engine analytical/invariant tests establish model correctness. Test Fixture images provide secondary integration and renderer evidence.

In particular:

- the LDR/sRGB optics target may verify deterministic field/channel mapping behavior;
- it does not establish spectral lens calibration, MTF, RAW/CFA truth, HDR radiometry, or real-lens performance.
