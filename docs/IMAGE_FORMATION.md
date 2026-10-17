# Image-Formation Contract

> **Release context.** This page was written for package 1.2.0 (root API 1.2.0) and has not been re-reviewed for later releases. The [changelog](../CHANGELOG.md) describes the current release. Model and subsystem version numbers on this page, and any dated records, are separate from the package version. See also the [developer guide](DEVELOPERS.md) and the [1.2.0 release contract](RELEASE_1_2_0.md).

Photivra's image-formation contract says, for every current and future camera effect:

- which scientific domain **owns** it;
- which **coordinate system** it uses;
- what it **depends on** and what it is **coupled with**.

It does not claim that every stage is implemented. It also does not require renderers to run one literal chain of filters in sequence.

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

These domains say who owns what. Some effects involve more than one domain. Examples:

- Scene illumination, the optical response of materials, geometry and visibility, emission, indirect light transport and time all belong upstream, in `scene-radiance-evaluation`. Source metadata and RGB renderer values are not sensor input.
- Focus breathing changes projection and magnification, so it couples lens mapping to scene projection.
- Lateral chromatic aberration is a field mapping that depends on wavelength or channel. It may share its wavelength basis with the PSF (point-spread function) model.
- Illumination vignetting affects throughput only.
- Mechanical (pupil) vignetting can change both throughput and the PSF/bokeh shape.
- Diffraction depends on the effective pupil and belongs to the PSF domain.
- Rolling readout couples native sensor timing to integration over time.
- Camera rotation should be a function of physical exposure time, so that global and rolling readout can use the same motion model.

## Scene-radiance ownership

`scene-radiance-evaluation` sits between `scene-ray-projection` and `lens-field-pupil-evaluation`. It is a partial foundation.

Its authoritative quantity is **outgoing scene spectral radiance**: the light leaving the scene, produced from illumination, geometry and visibility, material response, emission, indirect transport and physical time.

- The renderer-neutral scene request/result boundary supplies declared radiance samples.
- The production composer validates a bound sample and applies optical throughput.
- It does not run a complete scene renderer, and it does not establish a measured radiance field.

The existing `SceneRadiometry` metadata stays separate. `absolute-luminance` is a photometric luminance anchor, not a radiance field resolved by wavelength. Likewise, these are all different quantities and must not be substituted for one another:

- a light source's SPD (spectral power distribution);
- an RGB HDR environment;
- source irradiance;
- spectral irradiance at the sensor plane.

See [Scene Radiance and Illumination](SCENE_RADIANCE_AND_ILLUMINATION.md).

**Continuous spectra and lines.** Shared spectral planning keeps continuous spectra apart from discrete spectral lines.

- Continuous scene, optics and sensor factors can share an explicit coverage intersection (air or vacuum wavelengths) and a union of breakpoints.
- Line spectra (delta-like) stay as measures already integrated over wavelength. They are summed without a dλ factor. They are never turned into a synthetic continuous density just so they can enter the continuous sensor quadrature path.

**Time-varying illumination** uses a separate temporal profile.

- Source waveforms are relative multipliers, evaluated in physical seconds.
- Before flash or flicker can take part in exposure integration, the waveform must be explicitly registered to the capture's `first-opening-boundary-phase` reference.
- The integration interval is the local exposure window, not the total sensor data-readout duration.
- The temporal foundation returns only multipliers and time measures. Source magnitude, material and visibility transport, outgoing radiance, optics, sensor response, metering and automatic exposure are all separate, later steps.

## Coordinate spaces

The contract distinguishes these coordinate spaces:

- `scene-metric`: scene/world metric coordinates.
- `image-plane-metric`: origin on the optical axis, +X right, +Y up, millimetres.
- `native-sensor-physical`: origin on the optical axis, +X right, +Y down, millimetres.
- `native-raster`: origin at top left, +X right, +Y down, pixels.
- `oriented-capture-raster`: native raster coordinates after an explicit physical-orientation transform.
- `output-raster`: the result of digital crop and resampling.
- `display`: consumer or display coordinates. These are never authoritative for camera science.

Native sensor and raster coordinates do not change when the camera is physically rotated.

**Crossing between oriented raster and image plane.** Use `mapOrientedPhysicalUvToImagePlanePoint()` and `mapImagePlanePointToOrientedPhysicalUv()` when a renderer or integration needs to move between a normalised region of the oriented physical raster and the `image-plane-metric` space before orientation. These transforms:

- explicitly undo or apply the physical orientation;
- convert between the capture contract's +Y-down physical basis and the optical image plane's +Y-up basis.

They do not apply projection, distortion, crop or lens equations. Asymmetric physical bounds stay asymmetric.

## Partial ordering and coupling

- `requiredUpstreamStages` lists hard scientific dependencies.
- `coupledStages` lists interactions that must not be treated as independent post-processing steps.

The required-dependency graph has no cycles. Coupling can go both ways, because it describes shared scientific state, not execution order.

An implementation may merge stages for performance only if the merged version is mathematically equivalent, and the public meaning of each stage and effect is unchanged.

## PSF contribution foundation

The `field-wavelength-psf` stage has its own public foundation, documented in [PSF and Pupil Foundation](PSF_FOUNDATION.md).

Implemented:
- geometric defocus-circle diagnostic;
- ideal circular-pupil Airy first-zero diagnostic;
- explicit context for field position, depth, wavelength and pupil.

Reserved:
- non-circular diffraction;
- mechanical pupil clipping;
- field curvature;
- aberration that varies across the field;
- bokeh that varies across the field.

No combined PSF is calculated yet.

## Temporal basis

Physical time is measured in **seconds from the start of exposure**.

An algorithm may derive a normalised `[0,1]` shutter parameter, but that is not the authoritative time coordinate.

Exposure duration and sensor readout timing are independent:

- a global readout does not mean zero motion blur;
- a rolling readout changes when different native sensor locations are sampled and integrated;
- the native readout direction stays defined in native sensor coordinates, even when the camera is physically rotated.

This lets rolling-shutter work use the same time-based camera-motion model as global exposure.

The timing primitives build on one another. Details are in [Motion and Signal Foundation](MOTION_AND_SIGNAL.md).

- **`calculateSensorReadoutTiming()`** gives a native-raster spatial readout phase schedule that does not depend on orientation. Its first model is a uniform-linear, single-axis approximation declared by the caller, with data-readout duration and rolling spatial skew each backed by separate evidence. It does not define exposure windows or shutter-curtain motion. It does not infer physical hardware readout lines from the effective native image raster.
- **`assessReadoutExposureTimingLinkage()`** can validate an explicitly evidenced, normalised spatial-phase relationship between rolling readout and an electronic exposure edge. It never infers absolute time synchronisation. Total data-readout duration does not stand in for exposure timing, and matching direction or span alone is not enough evidence of a shared clock.
- **`calculateCaptureExposureWindows()`** describes the local opening and closing exposure edges.
  - Its explicit time reference is the first opening edge.
  - It keeps nominal, opening and closing timing independent.
  - It checks that the local duration is positive across the whole active rectangle.
  - It keeps the actuator (mechanical, EFCS or electronic) separate from timing.
  - It does not automatically bind the exposure edges to sensor readout phase, or to the camera-rotation time origin.
- **`calculateCaptureRotationTrajectories()`** explicitly sets the first opening edge as `t = 0` of the pure camera-rotation model, and evaluates stationary reference rays at each local exposure start and end. It is forward temporal geometry only. It does not use sensor readout timing, does not solve the implicit rolling-shutter image warp, and does not integrate motion blur over the exposure.
- **`calculateCaptureRotationInverseMappings()`** maps a destination to a reference ray at an instant, at a phase the caller chooses within each local exposure window. With pure rotation, once the destination location fixes the local capture time, the inverse is analytic, so no iterative solver is used. This is still geometry before the lens and before output; it does not replace integration over a finite exposure.
- **`calculateCaptureRotationTemporalQuadrature()`** gives fixed uniform-midpoint time nodes across each local exposure, with separate measures for a normalised average and for an integral in seconds. The instantaneous inverse mapping stays the source of truth for geometry. This layer does not itself integrate radiance, visibility, shutter transmission, sensor response, PSF or output pixels.

## Production composition consumer

A separate production-plan contract uses this ownership graph. The production planner:

- expands the required upstream stages from this graph;
- keeps the coupled-stage metadata;
- never creates a second, hidden stage order;
- records modelled-zero, omitted, unsupported and blocked states explicitly;
- keeps the renderer's capability declaration separate from scientific stage ownership.

The current plan schema `0.7.0` supports:

- the physical sample path;
- processing of an attached RAW;
- the bounded [executed environment capture](PRODUCTION_ENVIRONMENT_CAPTURE.md).

With complete declared environment input, all fourteen graph stages can run, through RAW and optional output. Sample-only and attachment-only routes keep their missing upstream blockers. Temporal geometry alone does not integrate radiance.

See [processed output](PROCESSED_OUTPUT.md) for the attachment boundary, and [V1 composition and consumer map](V1_COMPOSITION_MAP.md) for current consumers and required handoffs.

See [Production Image-Formation Plan](PRODUCTION_COMPOSITION.md).

## Renderer semantics

A renderer may use a bounded real-time preview approximation, or a higher-fidelity deterministic reference evaluation. Both must use the same engine-owned scientific contract.

For geometric warps:

- destination samples are inverse-mapped to source locations;
- premultiplied-alpha meaning is preserved;
- scene depth and occlusion order are preserved across warps;
- the choice of renderer backend may change implementation and fidelity, but not what the model means.

## Sensor ordering and standalone boundaries

The static ordering registry 0.4.0 keeps broad "foundation" and "reserved" maturity labels. These are not capability checks for a specific route. Plan 0.7.0 records what actually runs, with its limits and blockers. The standalone layers below explain what each primitive owns; they do not contradict the separate executed environment route.

The contract owns this sensor ordering. Individual descriptive profiles do not run the whole path; the bounded environment production route explicitly combines the supported terms:

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

Terms: OLPF is the optical low-pass (anti-aliasing) filter. CFA is the colour filter array. ADC is the analog-to-digital converter.

Temporal exposure and readout feed into the photosite and charge stages. They do not act as an unrelated blur applied at display time.

The sensor primitives below each own one part of this chain. In order:

**Capture-mode profile.** Describes the acquisition sequence, effective sampling per frame, optional sensor offsets between frames, labels for reconstruction stages, the processed-image raster, and downstream dependencies. It does **not** implement the reserved CFA, photosite or reconstruction algorithms. A mode's processed raster stays upstream of physical orientation and the final output crop and resampling. It cannot redefine physical sensor geometry or FOV.

**Colour-sampling topology profile.** Describes monochrome sensors, any periodic mosaic (its phases and channel assignment), and layered colour declarations whose spatial relationship is explicitly unresolved. The periodic topology lives on its own lattice of native sensor sampling sites, not on `NativeImageRaster`. No binding to effective image samples or physical photodiodes is inferred. This metadata does not implement the reserved photosite/CFA sampling stage, spectral response, sparse site exceptions, RAW sampling or reconstruction.

**Native-effective-raster / colour-site binding.** The structural bridge between capture-mode effective samples and the monochrome or periodic topology.

- It requires evidence for the exact native raster relationship and the grouped-mode phase.
- It preserves the absolute full-frame CFA phase.
- It reports compact source regions and channel counts before reconstruction.

It still does **not** implement the photosite/CFA sampling stage: no signal weights, spectral response, photons or electrons, RAW values, aliasing or reconstruction are calculated.

**Sensor optical-stack profile.** Makes the upstream stack boundary explicit without claiming a full stack response.

- The ordered physical component roles and the presence of microlenses are descriptive only.
- The effective anti-aliasing (AA) response is modelled separately as one of: unknown, absent, present but unresolved, or a normalised native-physical point-splitting approximation.
- The resolver exposes only that AA spatial term.
- Future work: cover glass and filter transmission and refraction, microlens angular and collection behaviour, dependence on wavelength, field and polarisation, and convolution with the lens PSF.

The profile on its own is not a complete optical-stack simulation. The production environment route uses the supported explicit spatial and response bindings, and records the approximation limits.

**Sensor sampling-aperture profile.** Gives explicit native-physical registration for the lattice of colour-site centres, and a first geometric footprint of the sensitive region.

- The rectangle is a normalised area-averaging support, with its geometric area and fraction reported separately.
- It is **not** QE (quantum efficiency) or radiometric collection efficiency.
- AA point splitting, microlens redirection, diffusion and crosstalk, spectral response, photons and electrons, and RAW values are still absent.

This provides geometry for the reserved `photosite-cfa-sampling` stage, without claiming that stage is fully implemented.

**Sensor spatial quadrature.** Combines the resolved AA point-splitting term with the geometric aperture, using fixed native-physical midpoint nodes.

- AA is applied by inverse source lookup.
- The destination site's CFA channel stays fixed.
- Source support outside the active area, before AA, is preserved.

The result is still only a geometry and measure plan: no optical field, spectral response, radiometry, time integration, RAW value or reconstruction. So the `photosite-cfa-sampling` stage stays reserved.

**Spatial-sample reducer.** Applies those weights to caller-supplied nonnegative linear relative values, or to physical irradiance. It does not turn a channel ID into spectral filtering, does not integrate over time or wavelength, and does not compute photons, electrons or RAW codes. The result is a site sample before any response is applied, so the full `photosite-cfa-sampling` stage stays reserved.

**Sensor spectral-response profile.** Gives linked channels an explicit, wavelength-dependent meaning. At one wavelength it can resolve effective external QE, effective responsivity in A/W, or a declared filter × detector-EQE (external quantum efficiency). It keeps the response scope and the provenance of reusable data. It does no spectral irradiance integration, exposure-time integration, photon-to-electron conversion or RAW reconstruction. So the full `photosite-cfa-sampling` stage and the downstream charge stages are still only partly founded or reserved.

**Sensor spectral-quadrature plan.** Gives fixed wavelength nodes and dλ measures, without turning them into signal.

- Response knots and explicit caller breakpoints define the segment edges.
- A maximum sub-interval width limits midpoint spacing.
- The selected response scope and provenance stay visible.
- Sensor-response coverage is not treated as scene or optics coverage. Response values are not applied. QE is not confused with A/W responsivity. Continuous-density quadrature does not silently approximate discrete spectral lines.

**Shared spectral coverage.** Derives the sensor channel's usable range and interpolation knots, and combines them with separately declared scene, optics and material coverage. This is planning metadata only. Discrete illumination lines use a separate integrated-line path; they are not accepted as extra continuous quadrature breakpoints.

**Spatio-spectral reducer.** The first explicit space × wavelength composition, for sensor-plane spectral irradiance E_lambda(x,y) supplied by the caller in W/m²/nm.

- It requires exact linkage to the colour profile and channel.
- It keeps every required spatial source sample, including those at edges and outside the frame.
- It caps the size of the combined space × wavelength grid.
- It produces wavelength-integrated irradiance (before response) and the incident flux on the geometric aperture.

**Response-application compatibility gate.** Checks whether that result is structurally eligible for a later spectral response. It requires:

- exact linkage of response, colour profile, aperture and optical stack;
- a source plane compatible with the response scope;
- matching geometric-aperture normalisation;
- explicit spatial uniformity or separability of the response;
- a resolved wavelength basis;
- compatible reference conditions, or an explicit approximation.

Full-site-cell and effective-collection-area normalisations stay blocked, because the current reducer has not integrated over those area bases.

**Response operating-range gate.** Checks optical input against an evidence-backed linearity range, with explicit wavelength applicability, reference conditions, uncertainty and a non-linearity criterion.

- It distinguishes evidence for the broadband total from applicability per spectral bin. Per-bin applicability needs an explicit maximum bin width.
- Wavelength-dependent response conversion is allowed only when every spectral bin, and the spatially reduced aperture, satisfy the declared linearity model.
- Linearity of the exposure characteristic curve, saturation of accumulated charge (full well), conversion gain, readout electronics and ADC linearity are later temporal and electrical contracts.

**Photon-energy wavelength foundation.** Resolves the energy per photon used by EQE conversion.

- Vacuum wavelengths use exact SI h and c.
- Air wavelengths must first be converted to vacuum, using a sourced phase refractive index at that exact wavelength, with compatible atmospheric conditions. The shortcut "air ≈ vacuum" is never applied implicitly.

**EQE electron-rate foundation.** Applies the photon-domain response conversion after all earlier gates.

1. Each wavelength bin's radiant-power contribution is evaluated separately.
2. It is divided by photon energy to get the incident photon rate.
3. Effective external QE is applied through the spectral-response resolver.
4. The expected generated-electron rates are summed with compensated summation.

**A/W responsivity foundation** (the sibling of the EQE path). Applies the current-domain response separately for each wavelength bin and sums the magnitude of the detector photocurrent. Its calibration is also bound to explicit detector bias and current-readout load conditions. This current is not treated as an electron rate, accumulated charge, transimpedance voltage or a statement about circuit polarity.

Both paths still stop before exposure-time integration, accumulated charge and full well, random noise, analog electronics, ADC/RAW and reconstruction.

**Local sensor-rate / exposure binding.** Carries each response rate the engine produced back to its exact colour-sampling site (through an evidenced one-to-one native-effective-raster relationship), and into the local shutter-window schedule. This says which local time interval belongs to that rate. It deliberately does not assume the rate stays constant during the interval.

**Constant-rate time integration.** Allows rate × local duration only under a stationarity declaration bound to the exact site and window. EQE rates give fractional expected photon and electron counts. A/W current gives photocharge magnitude in coulombs, without inferring carriers.

**Dark current.** Adds thermally generated expected electrons (before any compensation) to the EQE-side charge model, using the exact local exposure duration and explicit temperature applicability. It does not model black-level compensation, hot-pixel or defect excess, leakage or injection, dark-current non-uniformity (unless separately evidenced), or the random realisation of dark-current shot noise. Integrated A/W charge is still not treated as stored pixel electrons.

**Accumulated-charge completeness.** Combines photo, dark and explicitly incremental other stored-electron expectations, only when all of them are bound to one exact local exposure. Completeness is never inferred from missing components. An evidence-backed declaration must list the additional charge components supplied, and state that every material contributor to stored electrons is accounted for.

**Physical charge capacity.** Compares the complete expected stored-electron total with an evidence-backed storage limit. It is an assessment of expected values only. It does not model the probability of random saturation, clamping, charge beyond capacity, overflow amount, anti-blooming or redistribution to neighbours.

**Camera saturation capacity** (separate from physical capacity). Compares the expected dark-corrected photo signal, in electron-equivalents, against a measured or calibrated capacity of the camera's response chain. Dark and other stored charge are not added to this signal comparison, and the physical full well is not reused. The first camera-capacity contract does not say whether the analog electronics, the ADC or digital clipping, or some other stage is the actual limit.

Stage-specific clipping transfer functions, random noise, analog electronics, ADC/RAW and reconstruction come later.

## Current implementation status

Each stage is labelled:

- `existing-foundation`: the root engine already contains the relevant foundation.
- `partial-foundation`: some low-level science exists, but the full stage contract is not implemented. Current examples: spatial camera rotation in the temporal domain; and declared-scale focus breathing, radial distortion, RGB-channel lateral chromatic aberration and illumination throughput in the lens-field domain.
- `reserved-contract`: the ordering and ownership are reserved for future work only.

Do not assume a stage works just because it appears in the contract.

## Test Fixture relationship

External consumer fixtures can provide browser regression targets. The engine implementation and independent conformance tests remain the scientific source of truth.

Engine analytical and invariant tests establish that models are correct. Test Fixture images provide secondary evidence for integration and rendering.

In particular:

- the LDR/sRGB optics target can verify deterministic field and channel mapping behaviour;
- it does not establish spectral lens calibration, MTF, RAW/CFA truth, HDR radiometry or real-lens performance.
