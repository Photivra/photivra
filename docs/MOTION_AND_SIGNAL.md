# Motion and Signal Foundation

Release context: **package 1.2.0 candidate / root API 1.2.0**. Subsystem/model versions and dated introduction or measurement records below are independent historical identities; they are not distribution versions. See [developer navigation](DEVELOPERS.md) and [release contract](RELEASE_1_2_0.md).

## Projected subject motion

Subject-motion blur is modeled from image-plane displacement rather than broad labels such as "fast sport" or "slow subject."

`calculateProjectedMotionBlur()` projects one representative scene point at shutter open and shutter close after applying constant world-space linear velocity. The difference is the sensor-plane displacement.

Projection has two explicit modes:

- when `focusDistanceM` is omitted, nominal focal length is used as the backwards-compatible infinity-focus/pinhole projection distance;
- when `focusDistanceM` is supplied, the ideal Gaussian thin-lens image distance for that focus plane is used.

Projected displacement therefore depends on:

- focal length;
- optional focus-plane extension;
- shutter duration;
- starting object position/distance;
- motion direction;
- object velocity;
- optional sensor pixel pitch for pixel-domain reporting.

The low-level motion primitive still accepts one scalar pixel pitch. The newer sensor-geometry API preserves independent X/Y geometric pitch. The composed POC therefore fails closed when X/Y pitch differs by more than 1% rather than silently applying horizontal pitch to materially different vertical sampling.

The model can represent a representative point moving laterally and/or along the optical axis. It does **not** yet model an extended object's changing apparent scale across the exposure, rotational subject motion, acceleration, deformation, or occlusion changes. A large object moving significantly in depth can therefore exhibit real scale blur that this point-displacement primitive does not describe.

Camera motion is not folded into subject motion. Camera shake is modeled separately by `estimateCameraShakeBlur()`; panning detection/intent is not currently modeled.

The returned `deltaXmm`/`deltaYmm` components are legacy camera/image-plane components: +X right and +Y up. They are preserved for compatibility.

Capture raster coordinates use +X right and +Y down. POC API 0.19 therefore converts a legacy image-plane vector to native raster axes as `{ x, y: -y }` before applying the native↔oriented rotation helper. The additive capture diagnostics expose `nativeRasterDeltaPixels`, `orientedCaptureDeltaPixels`, and `outputDeltaPixels`; the legacy motion fields are not reinterpreted.

## Spatial camera rotation

`calculateCameraRotationImageMapping()` now provides the rotation-only primitive reserved by the image-formation contract.

The function:

- accepts one image-plane point at exposure start;
- uses physical time in seconds from exposure start;
- accepts constant pitch/yaw/roll angular velocity resolved in the camera axes at exposure start;
- integrates the simultaneous angular velocity as one axis-angle vector;
- transforms the stationary world ray by the inverse camera rotation;
- returns field-position-dependent image-plane displacement;
- optionally reports axis-aware geometric sample displacement.

For pure yaw/pitch, image displacement varies with field position because the rectilinear projection denominator changes away from the optical axis. Pure roll leaves the optical-axis center fixed while rotating off-axis points.

This is camera **rotation only**. Translation is excluded because parallax requires scene depth.

The returned image-plane/sample components use +X right and +Y up. Native raster remains +X right/+Y down and requires the existing explicit coordinate transform at capture composition boundaries.

## Sensor readout timing

`calculateSensorReadoutTiming()` provides a standalone capture-specific **native sensor scan-timing** foundation.

The model deliberately separates two evidence-backed seconds-valued facts:

- **capture data-readout duration** — the caller's declared duration for the selected capture mode's sensor data-readout operation;
- **rolling spatial-sampling skew** — the timing span that drives the first-to-last spatial scan phase in the current approximation.

Photivra does not assume those values are equal, and it does not infer an ordering relationship between them. For global readout, spatial skew is zero in this model even when the declared data-readout duration is non-zero.

For rolling readout, the caller also supplies an independently evidenced native scan direction. The current schedule is a `uniform-linear-single-axis` approximation over continuous native raster edge coordinates. This is intentionally **not** a claim that one `NativeImageRaster` row/column equals one physical photodiode row or one hardware readout line. Segmented, center-out, interleaved, multi-tap and other non-uniform schedules remain unsupported rather than being silently approximated as equivalent hardware.

Native sensor timing is orientation-invariant. `calculateSensorReadoutTiming()` therefore does not accept physical camera orientation or output raster geometry. When presentation/capture orientation is needed, callers compose the returned native direction vector with the existing native-to-oriented vector transform. Digital output crop/resolution cannot alter the native timing schedule.

Active-capture timing is also explicit: Photivra never scales a full-frame timing fact by crop dimensions to invent a cropped-mode timing. A caller must provide timing evidence appropriate to the selected capture mode/active area; later capture-mode work can bind those declarations more formally.

Mechanical, electronic-first-curtain and fully electronic shutter mechanisms are reported independently but remain scientifically inert in this slice. The function does **not** define local exposure start/end times, mechanical curtain travel, EFCS curtain interaction, rolling-shutter image distortion, flash/flicker bands, or motion integration. Those later models must combine their own timing with this sensor schedule explicitly rather than treating sensor readout as a surrogate shutter-curtain model.

## Readout/exposure spatial linkage

`assessReadoutExposureTimingLinkage()` is the explicit boundary between the native sensor readout schedule and the capture exposure-window schedule.

The contract deliberately distinguishes **spatial phase/order** from **absolute temporal synchronization**.

A caller may declare:

- `unlinked` — Photivra asserts no relationship for this capture. This is not evidence that the physical processes are independent.
- `spatial-phase-linked` — one or more electronic exposure boundaries are asserted to share the rolling readout's normalized native spatial phase, either in the same direction or reversed.

Every positive link carries its own provenance. The underlying readout direction/skew and exposure-boundary direction/traversal facts keep their own separate evidence.

A positive spatial-phase link is valid only when:

- sensor readout is rolling and therefore has a spatial scan;
- the selected exposure boundary is electronic;
- the selected exposure boundary is itself a uniform-linear native scan;
- `same` phase orientation uses the same native scan direction;
- `reversed` phase orientation uses the exact opposite direction on the same native axis.

The rolling-readout spatial skew and exposure-boundary traversal duration do **not** have to be equal. Their dimensionless ratio is reported diagnostically. A ratio of 1 still does not prove a shared clock origin or temporal coincidence.

`captureReadoutDurationSeconds` is preserved with units/evidence but is never used to validate an exposure linkage. Data transfer/readout duration can describe a different physical interval from exposure-boundary traversal.

Absolute temporal alignment remains `not-established` in this foundation. A future mode profile may supply an evidence-backed temporal offset/synchronization relationship if defensible data exists, but Photivra will not infer it from shutter mechanism, scan direction, matching timing spans, output resolution, or adjacent camera specifications.

## Capture exposure windows

`calculateCaptureExposureWindows()` adds the next standalone timing layer after native sensor readout timing.

It represents **opening and closing exposure boundaries separately**. Each boundary can currently be simultaneous or a caller-declared uniform-linear scan in invariant native sensor coordinates. The nominal exposure duration is another independent evidence-backed seconds-valued quantity.

The output time reference is the **first opening-boundary phase**, not a claim that every native location has the same local exposure start. For each point, local start and end offsets are derived independently, and the engine reports local exposure duration.

Mechanical, EFCS, and electronic shutter mechanisms determine only which conceptual actuator owns the opening/closing boundary. They do not invent traversal timing:

- mechanical: mechanical opening and closing;
- EFCS: electronic opening, mechanical closing;
- electronic: electronic opening and closing.

The complete active rectangle is validated so a zero/negative local exposure duration cannot hide in an unsampled region.

This contract remains deliberately separate from `calculateSensorReadoutTiming()`. Sensor readout phase is not automatically an exposure boundary. It also remains separate from `calculateCameraRotationImageMapping()`: that API still accepts seconds from its existing exposure-start reference, and the capture rotation and production adapters explicitly bind local capture-window times to that motion basis.

The first exposure-window model does not include curtain acceleration, nonlinear or segmented electronic scheduling, flash/flicker interaction, shutter shock, EFCS-specific pupil/bokeh behavior, or rolling-shutter image distortion.

## Capture rotation exposure trajectories

`calculateCaptureRotationTrajectories()` is the first explicit integration between local capture exposure windows and the existing pure-camera-rotation mapping.

For each caller-selected native raster point, the engine:

1. resolves the point's local exposure start/end with `calculateCaptureExposureWindows()`;
2. maps that native point into the pre-orientation image plane at the **first opening-boundary phase**;
3. explicitly binds that capture reference to `t = 0` of `calculateCameraRotationImageMapping()` for this composition;
4. evaluates the same stationary world ray at the local exposure start and end;
5. reports the two mapped endpoints plus their image-plane chord.

The output is deliberately a **forward stationary-reference-ray trajectory**, not a rolling-shutter image warp.

That distinction matters because in a rolling capture the exposure/capture time depends on image location while camera motion also changes where a world ray lands. A renderer-ready rolling-shutter transform therefore requires a self-consistent inverse destination-to-source mapping rather than one forward displacement evaluated at a destination coordinate.

The endpoint chord also is **not a blur kernel**. Pure rotational image motion can follow a curved image-plane path, and exposure integrates radiance over the entire local interval rather than only its two endpoints.

Sensor data-readout timing from `calculateSensorReadoutTiming()` is intentionally absent. A particular electronic capture mode may have a documented relationship between sensor readout and exposure boundaries, but Photivra will require that relationship to be declared explicitly rather than assuming it universally.

The trajectory foundation remains rotation-only. Camera translation/parallax, subject motion, panning intent, object rotation/deformation, occlusion changes, exposure integration, flash/flicker, shutter shock, and the final inverse rolling-shutter warp remain future work.

## Capture rotation temporal quadrature

`calculateCaptureRotationTemporalQuadrature()` extends the instantaneous inverse mapping into a deterministic **temporal-geometry quadrature** over each destination point's complete local exposure interval.

The first model uses the uniform midpoint rule. For `N` temporal samples, normalized local phases are:

```text
phase_i = (i + 0.5) / N
```

so the exact opening and closing boundaries are not sampled. Each phase is evaluated through the already-public `calculateCaptureRotationInverseMappings()` contract rather than introducing a second camera-motion equation.

Every temporal node reports two different measures:

- `normalizedTimeWeight = 1 / N` — dimensionless weight for a downstream **time average** under the declared uniform temporal-response approximation;
- `timeMeasureSeconds = localExposureDuration / N` — seconds-valued `dt` measure for a downstream **time integral**.

These are intentionally separate. The seconds-valued measure is not shutter transmission, photon count, radiometric throughput, scene radiance, sensor response, or a calibrated energy measurement.

The local exposure interval remains destination-dependent. A scanned opening/closing schedule can therefore shift node times between sensor locations, and different opening/closing traversal schedules can produce different local durations and therefore different `timeMeasureSeconds` values.

The first temporal-response model is `uniform-over-local-exposure`. That is an explicit approximation. This geometric primitive does not model shutter-transmission ramps or exposure-dependent sensor response. Registered temporal illumination/manual flash and explicit scene/EQE exposure APIs separately integrate declared changing light; geometry nodes alone provide no radiometric weighting.

The API returns **nodes and weights only**. It does not average reference coordinates, compute a blur radius/kernel, sample scene radiance, resolve visibility/occlusion, or write output pixels. Averaging geometric coordinates is not a substitute for integrating the radiance seen along the time-varying rays.

No geometry-only quadrature error estimate is reported. Image-integration error depends on downstream scene radiance, visibility, texture/edge frequency, and reconstruction as well as the camera trajectory. Renderer/reference implementations can compare increasing temporal sample counts in their radiance domain when convergence evidence is needed.

## Instantaneous capture rotation inverse mapping

`calculateInverseCameraRotationImageMapping()` is the exact inverse of the existing forward pure-rotation ray mapping under the same constant-axis assumptions. Once capture time is known, the captured image-plane ray is rotated analytically back into the exposure-start reference camera frame. There is no numerical root/fixed-point solve.

`calculateCaptureRotationInverseMappings()` composes that inverse with local exposure-window timing.

For each destination native sensor point:

1. the destination point selects its local exposure window;
2. the caller supplies `localExposurePhase` in `[0, 1]`;
3. capture time is `start + phase × localDuration`;
4. the destination native point is mapped into the ideal pre-lens image plane;
5. the captured ray is analytically inverted to the first-opening-boundary reference frame;
6. image-plane, native effective-sample, and physically oriented sample displacements are reported.

The phase is mandatory because a finite exposure has no single sharp geometry. Phase `0` means local exposure start, `0.5` is the local temporal midpoint, and `1` is local exposure end. None is automatically privileged as the final rendered image.

This inverse is renderer-oriented in the limited sense that it maps **destination capture location -> reference ray**. It still is not a finite-exposure renderer. Motion blur requires integration over the local interval, with an explicit exposure-weighting model if weighting is not uniform.

Sensor data-readout timing remains absent. A documented mode-specific relationship may later link readout and electronic exposure timing, but no such equality is assumed here.

The mapping is evaluated in the ideal pre-lens image plane. Radial distortion, chromatic aberration, PSF, output crop/resampling, camera translation/parallax, subject motion, occlusion changes, flash/flicker and shutter shock remain separate stages.

Reference rays are not clamped to the active source frame. Under camera motion, a valid captured destination can map to reference geometry outside the available reference image; a renderer must treat that as missing source coverage rather than silently stretching or clamping edge pixels.

The current inverse does not claim that an arbitrary rolling/capture-scan camera is globally one-to-one. More general motion models can produce folds, repeated visibility or other multi-perspective behavior; those cases require additional validity analysis rather than being inferred from this pure-rotation slice.

## Temporal image-formation basis

The image-formation contract defines physical time in **seconds from exposure start**.

The separate spatial camera-rotation model is evaluable at arbitrary supported physical times rather than returning only one finished full-frame displacement. That allows global exposure and later rolling readout to consume the same camera-motion model.

Exposure duration and sensor readout timing are independent concepts:

- global readout can still contain subject/camera motion blur;
- rolling readout changes the exposure/readout schedule across native sensor locations;
- physical orientation does not redefine native sensor scan direction;
- depth-dependent camera translation is not part of the initial rotational-flow model because parallax depends on scene depth.

## Exposure relations

`calculateExposureValue100()` implements EV100 from aperture and shutter duration.

`calculateRelativeOpticalExposure()` compares the proportional image-plane exposure relation `t / N²`.

These calculations do not imply a photon count because they do not include scene radiance, lens transmission/T-stop, vignetting, spectral response, or sensor calibration.

`calculateRelativeRenderedExposure()` combines the relative optical exposure with the nominal ISO gain ratio (`iso / referenceIso`) and reports both the linear factor and stop difference. It is intended for deterministic relative rendering against a declared reference, not for radiometric calibration; it does not model photon creation, sensor noise, clipping, tone mapping, or lens transmission.

`calculateEquivalentIso()` treats ISO as nominal gain/brightness compensation needed to preserve rendered exposure after an aperture/shutter change. It is not used as a shortcut for noise or photon creation.

## Signal/noise primitives

The root package also exports low-level deterministic sensor primitives:

- `calculatePhotoelectrons()`: caller-supplied mean incident photons × caller-supplied quantum efficiency;
- `calculateSignalToNoise()`: Poisson shot-noise standard deviation plus independent caller-supplied RMS read noise, reported as linear and dB SNR.

These functions do **not** derive incident photon counts from scene imagery.

They do not currently model dark current, fixed-pattern noise, PRNU/DSNU, ADC quantization, clipping/full-well behavior, CFA/demosaic, downstream denoising, or a particular commercial sensor.

The composed POC intentionally does not expose photon/noise output.

The root package now includes a **radiometry-readiness gate** that validates whether a declared prerequisite package contains scene spectral radiance, optical transmission, pupil/vignetting behavior, explicit photosite collection-area semantics, exposure integration, sensor response, evidence, and uncertainty declarations.

Readiness is deliberately separate from signal/noise calculation:

- `not-ready`: prerequisite categories are missing;
- `approximate-only`: all categories exist, but at least one is approximate or has unquantified uncertainty;
- `calibrated-ready`: all categories are declared calibrated with quantified uncertainty.

These states describe the declared prerequisite package only. They do not prove a calibration is correct, do not calculate incident photons, and never enable photon/noise output in `simulatePocCamera()` automatically.

Geometric pixel/sample pitch is not accepted as photon-collection area. An explicit effective collection area or geometric cell area plus fill factor is required.

## Provenance

The equations in this slice are independently implemented from established projective geometry, exposure relations, and elementary photon/statistical noise models. No third-party source code or calibration dataset is incorporated by these modules.
