# Motion and Signal Foundation

Release context (dated historical note): written for the **package 1.2.0 candidate / root API 1.2.0** and not re-reviewed for later releases; see the [changelog](../CHANGELOG.md) for the current release. Subsystem/model versions and dated introduction or measurement records below are independent historical identities; they are not distribution versions. See [developer navigation](DEVELOPERS.md) and [release contract](RELEASE_1_2_0.md).

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

Rotation sign convention (shared by every rotation API, 2.0.0):

- camera axes at exposure start are +X right, +Y up, +Z forward along the optical axis; this basis is **left-handed**;
- positive pitch/yaw/roll follow the **physical right-hand rule** about +X/+Y/+Z (curl the right-hand fingers with the thumb along the axis);
- positive **yaw** turns the optical axis to the **left** (counter-clockwise seen from above), so stationary image content moves toward image **+X**: Δx = +d·tan(yaw·t) at the optical axis;
- positive **pitch** tilts the optical axis **up**, so stationary image content moves toward image **−Y**: Δy = −d·tan(pitch·t) at the optical axis;
- positive **roll** rotates the camera **clockwise as seen by the photographer** looking along +Z, so stationary image content rotates counter-clockwise in the +X-right/+Y-up image plane;
- d is the projection distance (focal length, or the thin-lens image distance when focus is supplied).

Because the basis is left-handed, the plain component Rodrigues/cross-product formula would produce the mirror-image rotation; the engine applies the physical rotation through one shared internal helper. Before 2.0.0, `calculateCameraRotationImageMapping()` and its inverse used that mirrored sense for all three axes, and `estimateCameraShakeBlur()` used the mirrored sense for pitch only.

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

Mechanical, electronic-first-curtain and fully electronic shutter mechanisms are reported independently but remain scientifically inert in this slice. The function does **not** define local exposure start/end times, mechanical curtain travel, EFCS curtain interaction, flash/flicker bands, or motion integration; an electronic rolling shutter links readout to exposure only through the explicit model in [Electronic rolling-shutter image formation](#electronic-rolling-shutter-image-formation). Those later models must combine their own timing with this sensor schedule explicitly rather than treating sensor readout as a surrogate shutter-curtain model.

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

The first exposure-window model does not include curtain acceleration, nonlinear or segmented electronic scheduling, shutter shock or EFCS-specific pupil/bokeh behavior. Rolling-shutter distortion and flicker banding are not separate warps: they emerge when per-site windows carry the line offset, see [Electronic rolling-shutter image formation](#electronic-rolling-shutter-image-formation).

## Electronic rolling-shutter image formation

Every native site already resolves its own local exposure window, and every image-formation consumer samples
time inside that window: the environment RAW path (`simulateEnvironmentSensorRawFrame`,
`createNativeEnvironmentRawTask`, the browser-native reference executor) queries scene radiance and camera
rotation at the site's own midpoint times, the production plan's rotation quadrature uses the same windows,
and `integrateSceneIlluminationTemporalMultiplierOverExposureWindow()` integrates source waveforms over them.
What was missing was the **row offset itself**: a rolling readout declaration described only sensor data
readout, so with simultaneous exposure boundaries every row saw the same window.

`deriveElectronicRollingShutterExposureSchedule()` is the explicit linkage model
(`electronic-rolling-shutter-line-reset-read` 1.0.0) for a fully electronic, line-sequential CMOS rolling
shutter. Each line is reset, integrates for the exposure time `T` and is read; the reset pointer leads the
read pointer by `T` and both advance at the line rate (El Gamal & Eltoukhy 2005; Liang, Chang & Chen 2008).
With the uniform-linear scan used throughout this engine:

```text
s       = normalized scan position of the native point along the readout direction, s ∈ [0, 1]
          (top-to-bottom: s = (y − rect.y)/rect.height; bottom-to-top: 1 − that; same for columns)
τ       = declared first-to-last spatial sampling skew of the rolling readout (active capture)
window  = [s·τ, s·τ + T]            local duration = T for every line
```

Both exposure boundaries therefore become uniform-linear scans in the readout direction with traversal `τ`.
The schedule is a complete exposure schedule (`toCaptureExposureSchedule()`), so it is passed unchanged as a
native RAW / environment `exposureWindow`, or as a production `temporalCapture.exposureWindowInput` together
with `readoutExposureLinkage: { kind: "electronic-rolling-shutter-line-reset-read", evidence }`. The plan then
verifies that the schedule is exactly the one derived from its rolling readout
(`isElectronicRollingShutterExposureSchedule()`) and reports
`readoutExposureSynchronization: "electronic-rolling-shutter-line-linked"`; without the linkage it keeps
`"not-assumed"` and global behaviour is unchanged.

Consequences that now emerge from per-site sampling, with no image warp drawn afterwards:

- **Skew of moving subjects.** A vertical edge moving horizontally at `v` native pixels per second is recorded
  by line `y` at time `s(y)·τ + phase·T`, so it appears displaced by `Δx(y) = v·τ·(y_center − y_ref)/H`
  between lines (H = active rows). Top-to-bottom readout shears it one way, bottom-to-top the other; a global
  (simultaneous) schedule leaves it unsheared. `test/rolling-shutter-image-formation.test.ts` recovers this
  shear exactly (to 1e-10 px) from the photon expectations of the full environment RAW path.
- **Camera rotation / translation wobble.** Rotation and translation are evaluated at each line's own times,
  so yaw at `ω` adds `ω·Δt` of angle between lines `Δt = τ·Δs` apart (verified on the environment queries and
  the production rotation quadrature). Time-varying angular velocity would produce wobble; the current motion
  inputs are constant-rate, which gives a pure skew.
- **Partial exposure.** A source that exists for less than `τ + T` (a flash, a passing object) is captured
  only by the lines whose windows overlap it.
- **Flicker banding.** A periodic source waveform of period `P` integrated over `[s·τ, s·τ + T]` varies with
  `s`; the band pattern repeats every `H·P/τ` rows and disappears when `T` is a whole multiple of `P` (the
  integral of a periodic waveform over whole periods is phase independent). Mains-powered lamps commonly
  modulate at twice the mains frequency (IEEE Std 1789-2015); the banding mechanism in line-sequential CMOS
  capture is described by Poplin (2006).

Limits: uniform line rate, no reset jitter, no global-reset-release or mechanical-close hybrids, and `τ` is a
declared active-capture value (never scaled from a full-frame figure). The data-readout duration still never
validates the linkage, and mechanical or EFCS shutters keep their own declared curtain schedules.

## Video frame sequences

`resolveVideoFrameSequence()` turns the existing `"video"` optical capture state (`OpticalProfileState` with
`captureMode: "video"` and `frameRateHz > 0`) and a shutter angle into ordinary `ResolvedReleaseFrame`s that
`createProductionCaptureSnapshotFromReleaseFrame()` consumes unchanged.

```text
frame period          = 1 / f
exposure (angle θ)    = (θ / 360) / f              θ ∈ (0°, 360°]
frame k opens at      = k / f                      seconds from sequence start (absolute index k)
frame k seed          = MurmurHash3_x86_32(sequenceSeed, k, 0x56494446 "VIDF")
rolling line s, frame k integrates [k/f + s·τ, k/f + s·τ + T],  requires τ ≤ 1/f
```

`calculateShutterAngleExposureSeconds()` / `calculateShutterAngleFromExposureSeconds()` implement the
shutter-angle relation of a rotary (or rotary-equivalent electronic) shutter (American Cinematographer
Manual). `assessShutterAngleRule()` compares an angle with the **180° rule** (`T = 1/(2f)`) and reports the
signed deviation in stops; the rule is a cinematographic convention for motion-blur appearance, not physics,
and the result says so (`conventionNotPhysics: true`). For example 24 fps at 172.8° gives `T = 1/50 s`, a
common choice to integrate whole 100 Hz flicker periods.

**Frame-to-frame determinism.** Frame start, exposure, seed and schedule depend only on the inputs and the
absolute frame index, never on earlier frames or on chunking: resolving frames 0–9 at once equals resolving
0–3, 4–6 and 7–9 separately (tested). Frame times use `k / f` directly (no accumulated sums), so floating-point
error does not grow along a clip. Each frame's per-site noise streams are then derived from its own seed by
the existing per-site MurmurHash3 schedule.

Not modeled: frame-rate drift, dropped or variable-rate frames, automatic exposure between frames, sensor-mode
switching, compression/encoding and temporal noise reduction.

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

These two scalar primitives do not model dark current, fixed-pattern noise, PRNU/DSNU, ADC quantization, clipping/full-well behavior, CFA/demosaic, downstream denoising, or a particular commercial sensor. The per-site RAW readout chain below does model dark current, opt-in fixed-pattern noise, ADC quantization and saturation; it still does not model blooming or a particular commercial sensor.

## ISO gain, fixed-pattern noise and dark-current temperature (2.0.0)

### ISO maps to analog and digital gain

ISO is still never an equation inside the readout: an ISO signal chain (`resolveGenericIsoSignalChain`) binds each
exposure-index setting to an explicitly declared readout regime. `createIsoGainReadoutRegimes()` derives one regime per
setting from declared parameters, using the linear camera model of EMVA Standard 1288 Release 4.0 (system gain K in
DN/e⁻; here stored as its reciprocal, electrons per code) and the exposure index of ISO 12232:2019:

| Quantity | Equation |
|---|---|
| exposure-index ratio | R = S / S₀ (S₀ = base exposure index) |
| analog gain | a = min(R, A_max) |
| post-ADC digital gain | d = R / a (1 inside the analog range) |
| electrons per code | g(S) = Q₀ / (span · a), span = digitalSaturationCode − blackLevelCode |
| pre-ADC threshold | Q_preADC(S) = Q₀ / a |
| electrons reaching digital white | Q₀ · S₀ / S |

Every ISO 12232 speed definition places its reference exposure at H ∝ 1/S (saturation-based S_sat = 78/H_sat; standard
output sensitivity S_SOS = 10/H_SOS). Under this model an exposure that is correct for S therefore produces the same
black-subtracted fraction of the white level at every S, and at a fixed exposure the RAW code doubles per stop until it
clips. `test/iso-brightness.test.ts` (the review repro `r4-iso-white.mjs`) checks, for every generic tier and ISO, that a
metered mid-grey exposure (H_m/H_sat = 10/78) normalizes to 10/78 within 1e-9 in the expectation and within 6σ shot noise
plus quantization in noise-free quantized codes, that a clipped site normalizes to 1, and that brightness is monotonic.

Read noise in electrons is declared per conversion-gain mode, never derived from S. A dual-conversion-gain sensor is
represented by a low-conversion-gain mode at low S and a high-conversion-gain mode, with lower input-referred read noise
and an optional storage limit, from a declared switch exposure index. These are explicit preset parameters, not a claim
about any camera.

The readout chain is: realized charge → physical clamp → read noise + fixed-pattern row/column offset → pre-ADC threshold →
code = signal/g + black + INL(code) → round half up (exact ties toward +∞, `Math.round`) → optional digital gain
d about black, re-quantized → clamp to [0, digitalSaturationCode]. Digital gain leaves missing codes, as on real
cameras. The noise-free code of a saturated site is therefore
`min(digitalSaturationCode, round((min(adcMax, round(black + min(capacity, Q_preADC)/g + INL)) − black) · d + black))`;
it reduces to `min(digitalSaturationCode, round(black + min(capacity, Q_preADC)/g))` when d = 1 and no INL is declared.

`adc.integralNonLinearity` optionally adds a piecewise-linear INL offset in code units (knots from code 0 to the ADC
maximum) before quantization; EMVA 1288 characterizes the resulting linearity error. Blooming is **not** modeled: each
native site is computed independently in tile order, so charge spilling into vertical neighbours would need a second
frame-wide pass over overflow charge from sites in other tiles. That breaks the per-site, tile-independent reference
architecture and bit-identical chunking, so the scalar physical clamp and its overflow diagnostic remain the model.

### Fixed-pattern noise

`SensorFixedPatternNoiseProfile` (model `photivra-sensor-fixed-pattern` 1.0.0) is an opt-in, per-sensor-instance spatial
pattern with EMVA 1288 definitions. Values come from MurmurHash3 streams of (sensor-instance seed, absolute colour-sampling
site x, y, stream), never from the capture seed, so the same sensor shows the same pattern in every capture:

- PRNU: gain g = max(0, 1 + σ_PRNU·z) multiplies the expected photo charge before Poisson sampling;
- DSNU: factor max(0, 1 + σ_DSNU·z) multiplies the population-mean dark expectation before dark Poisson sampling;
- hot pixels: a fraction f of sites uses a declared dark-current multiplier instead; because both act on the dark
  expectation, the excess scales with exposure time and with the dark-current temperature model;
- row and column offsets: static normal offsets (σ_row, σ_col, input-referred electrons) shared by a whole row or column,
  added with read noise before the pre-ADC threshold.

The thermal dark-current contract stays a population mean (`spatialDarkCurrentNonuniformityModeled` is unchanged); this
is a separately attached model. Omitting the profile gives exactly the uniform model. Normal factors are truncated at 0;
for σ ≤ 0.2 the resulting bias of the mean factor is below 1e-6.

### Dark-current temperature interpolation

Thermally generated dark current rises approximately exponentially with temperature (Arrhenius behaviour, often
summarized as a doubling temperature of a few kelvin; Janesick, *Photon Transfer*, SPIE 2007; EMVA 1288 Release 4.0
dark-current temperature dependence). The new `log-linear-temperature-table` model interpolates ln(rate) linearly between
adjacent declared samples, r = r₀·(r₁/r₀)^α, so each interval follows its own two samples and no global doubling
temperature is imposed. Rates must be positive and extrapolation still fails closed. With 10 e⁻/s at 20 °C and 100 e⁻/s
at 40 °C it gives 31.6 e⁻/s at 30 °C, where the legacy `piecewise-linear-temperature-table` gives 55. The legacy kind
remains accepted for callers whose data are better described linearly.

### Poisson sampling at very large means

Means of 1e9 electrons and above use a continuity-corrected normal approximation, k = max(0, ⌊μ + √μ·z + ½⌋), whose
skewness error 1/√μ ≤ 3.2e-5 is negligible there; the transformed-rejection sampler (Hörmann 1993) lost precision at
1e14 (var/mean 1.012). Means below 1e9 keep the previous samplers and draws.

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

References for the 2.0.0 readout additions (cited as published methods; no text, tables or data are copied):
ISO 12232:2019, *Photography — Digital still cameras — Determination of exposure index, ISO speed ratings, standard
output sensitivity, and recommended exposure index*; EMVA Standard 1288 Release 4.0, *Standard for Characterization of
Image Sensors and Cameras* (linear model, PRNU, DSNU, linearity, dark current); J. R. Janesick, *Photon Transfer*,
SPIE Press, 2007; W. Hörmann, "The transformed rejection method for generating Poisson random variables", *Insurance:
Mathematics and Economics* 12 (1993); G. E. P. Box and M. E. Muller, "A note on the generation of random normal
deviates", *Ann. Math. Statist.* 29 (1958); N. L. Johnson, A. W. Kemp and S. Kotz, *Univariate Discrete Distributions*,
3rd ed., Wiley, 2005 (normal approximation to the Poisson distribution).

References for the 2.0.0 rolling-shutter and video additions (published methods only; no code, text or data copied):
A. El Gamal and H. Eltoukhy, "CMOS image sensors", *IEEE Circuits and Devices Magazine* 21(3), 2005 (line-sequential
reset/read rolling shutter); C.-K. Liang, L.-W. Chang and H. H. Chen, "Analysis and compensation of rolling shutter
effect", *IEEE Transactions on Image Processing* 17(8), 2008; M. Meingast, C. Geyer and S. Sastry, "Geometric models of
rolling-shutter cameras", OMNIVIS 2005 (arXiv:cs/0503076); O. Ait-Aider, N. Andreff, J. M. Lavest and P. Martinet,
"Simultaneous object pose and velocity computation using a single view from a rolling shutter camera", ECCV 2006;
D. Poplin, "An automatic flicker detection method for embedded camera systems", *IEEE Transactions on Consumer
Electronics* 52(2), 2006; IEEE Std 1789-2015, *Recommended Practices for Modulating Current in High-Brightness LEDs for
Mitigating Health Risks to Viewers* (light modulation at twice the mains frequency); *American Cinematographer Manual*,
ASC Press (shutter angle and the 180° convention).
