# Motion and Signal Foundation

> **Release context.** This page was written for package 1.2.0 (root API 1.2.0) and has not been re-reviewed for later releases. The [changelog](../CHANGELOG.md) describes the current release. Model and subsystem version numbers on this page, and any dated records, are separate from the package version. See also the [developer guide](DEVELOPERS.md) and the [1.2.0 release contract](RELEASE_1_2_0.md).

This page covers how Photivra models motion during an exposure (subject motion, camera rotation, shutter and readout timing, rolling shutter and video) and the basic signal and noise calculations for the sensor.

## Projected subject motion

Subject-motion blur is computed from how far the subject's image moves on the sensor. It is not based on broad labels such as "fast sport" or "slow subject".

`calculateProjectedMotionBlur()` takes one representative scene point moving at a constant linear velocity in the world. It projects that point at shutter open and at shutter close. The difference is the displacement on the sensor plane.

There are two projection modes:

- **`focusDistanceM` omitted:** the nominal focal length is the projection distance. This is the backwards-compatible infinity-focus (pinhole) projection.
- **`focusDistanceM` supplied:** the ideal Gaussian thin-lens image distance for that focus plane is used.

The displacement therefore depends on:

- focal length;
- optional extra lens extension for close focus;
- shutter duration;
- the object's starting position and distance;
- direction of motion;
- object velocity;
- optional sensor pixel pitch, to report the result in pixels.

**Pixel pitch.** The low-level motion primitive accepts one scalar pixel pitch. The newer sensor-geometry API keeps separate X and Y pitches. So the composed POC (proof-of-concept simulation API) fails closed (rejects the request) when the X and Y pitches differ by more than 1%. It does not silently apply the horizontal pitch to clearly different vertical sampling.

**Limits.** The model can represent a point moving sideways, along the optical axis, or both. It does **not** yet model:

- an extended object's apparent size changing during the exposure;
- rotation of the subject;
- acceleration or deformation;
- changes in what is hidden or visible (occlusion).

A large object moving a long way in depth can show real scale blur that this single-point primitive does not describe.

**Camera motion is separate.** Camera shake is modelled by `estimateCameraShakeBlur()`. Panning detection or intent is not modelled.

**Coordinates.** The returned `deltaXmm`/`deltaYmm` are legacy image-plane components, with +X right and +Y up. They are kept for compatibility.

Capture raster coordinates use +X right and +Y down. POC API 0.19 therefore converts a legacy image-plane vector to native raster axes as `{ x, y: -y }`, before applying the native↔oriented rotation helper. The extra capture diagnostics expose `nativeRasterDeltaPixels`, `orientedCaptureDeltaPixels` and `outputDeltaPixels`. The legacy motion fields keep their meaning.

## Spatial camera rotation

`calculateCameraRotationImageMapping()` is the rotation-only primitive that the image-formation contract reserves. It:

- takes one image-plane point at the start of exposure;
- uses physical time in seconds from the start of exposure;
- takes a constant pitch/yaw/roll angular velocity, expressed in the camera axes at the start of exposure;
- integrates the simultaneous angular velocity as one axis-angle vector;
- transforms the stationary world ray by the inverse camera rotation;
- returns an image-plane displacement that depends on field position;
- can optionally report the geometric displacement in samples, per axis.

**Rotation sign convention** (shared by every rotation API since 2.0.0):

- Camera axes at the start of exposure are +X right, +Y up, +Z forward along the optical axis. This basis is **left-handed**.
- Positive pitch/yaw/roll follow the **physical right-hand rule** about +X/+Y/+Z: point your right thumb along the axis, and your fingers curl in the positive direction.
- Positive **yaw** turns the optical axis to the **left** (counter-clockwise seen from above). Stationary image content moves toward image **+X**: Δx = +d·tan(yaw·t) at the optical axis.
- Positive **pitch** tilts the optical axis **up**. Stationary image content moves toward image **−Y**: Δy = −d·tan(pitch·t) at the optical axis.
- Positive **roll** turns the camera **clockwise as seen by the photographer** looking along +Z. Stationary image content rotates counter-clockwise in the +X-right / +Y-up image plane.
- d is the projection distance: the focal length, or the thin-lens image distance when focus is supplied.

Because the basis is left-handed, the plain textbook Rodrigues (cross-product) formula would give the mirror-image rotation. The engine applies the physical rotation through one shared internal helper. Before 2.0.0, `calculateCameraRotationImageMapping()` and its inverse used the mirrored sense for all three axes, and `estimateCameraShakeBlur()` used it for pitch only.

For pure yaw or pitch, the image displacement varies with field position, because the rectilinear projection's denominator changes away from the optical axis. Pure roll keeps the centre fixed and rotates off-axis points.

This is camera **rotation only**. Translation is excluded, because parallax needs scene depth.

The returned image-plane and sample components use +X right and +Y up. The native raster is still +X right / +Y down, so composing with capture needs the existing explicit coordinate transform.

## Sensor readout timing

`calculateSensorReadoutTiming()` is a standalone model of **native sensor scan timing** for one capture mode.

It keeps two time values (in seconds, each backed by its own evidence) separate:

- **Capture data-readout duration:** the caller's declared duration of the sensor's data-readout operation in the selected capture mode.
- **Rolling spatial-sampling skew:** the time span from the first to the last spatial scan position, in the current approximation.

Photivra does not assume these are equal, and does not infer which is larger. For a global readout, spatial skew is zero in this model, even if the declared data-readout duration is not.

**Rolling readout.** The caller also supplies the native scan direction, with its own evidence. The schedule is a `uniform-linear-single-axis` approximation over continuous native raster edge coordinates.

- This does **not** claim that one `NativeImageRaster` row or column equals one physical photodiode row or one hardware readout line.
- Segmented, centre-out, interleaved, multi-tap and other non-uniform schedules are unsupported. They are not silently approximated as if they were the same hardware.

**Orientation and crop.** Native sensor timing does not depend on camera orientation, so `calculateSensorReadoutTiming()` does not accept orientation or output raster geometry. If you need the direction in oriented coordinates, combine the returned native direction vector with the existing native-to-oriented vector transform. A digital output crop or resolution cannot change the native timing schedule.

**Active area.** Photivra never scales a full-frame timing value by crop size to invent timing for a cropped mode. The caller must supply timing evidence for the selected capture mode and active area. Later capture-mode work can bind those declarations more formally.

**Shutter mechanism.** Mechanical, electronic-first-curtain (EFCS) and fully electronic shutters are reported, but have no effect in this model. The function does **not** define:

- local exposure start and end times;
- mechanical curtain travel or EFCS curtain interaction;
- flash or flicker bands;
- motion integration.

An electronic rolling shutter links readout to exposure only through the explicit model in [Electronic rolling-shutter image formation](#electronic-rolling-shutter-image-formation). Other models must combine their own timing with this sensor schedule explicitly. Sensor readout is never used as a stand-in for a shutter-curtain model.

## Readout/exposure spatial linkage

`assessReadoutExposureTimingLinkage()` is the explicit boundary between the sensor's readout schedule and the capture's exposure-window schedule.

It keeps two ideas apart: **spatial phase and order** (do they sweep the sensor in the same pattern?) and **absolute time synchronisation** (do they happen at the same moment?).

A caller may declare:

- `unlinked`: Photivra asserts no relationship for this capture. This is not evidence that the physical processes are independent.
- `spatial-phase-linked`: one or more electronic exposure edges are declared to follow the rolling readout's normalised native spatial phase, in the same direction or reversed.

Every positive link carries its own provenance. The readout direction and skew, and the exposure-edge direction and travel, keep their own separate evidence.

A positive spatial-phase link is valid only when:

- sensor readout is rolling, and so has a spatial scan;
- the selected exposure edge is electronic;
- the selected exposure edge is itself a uniform-linear native scan;
- for `same` orientation, it uses the same native scan direction;
- for `reversed` orientation, it uses exactly the opposite direction on the same native axis.

The rolling-readout skew and the exposure-edge travel time do **not** have to be equal. Their ratio (a pure number) is reported as a diagnostic. A ratio of 1 still does not prove a shared clock origin or that they coincide in time.

`captureReadoutDurationSeconds` is kept, with units and evidence, but is never used to validate an exposure link. The data-transfer (readout) duration can describe a different physical interval from the exposure-edge travel.

Absolute time alignment stays `not-established` in this model. A future mode profile may supply a time offset or synchronisation relationship backed by defensible data. Photivra will not infer it from the shutter mechanism, scan direction, matching time spans, output resolution or nearby camera specifications.

## Capture exposure windows

`calculateCaptureExposureWindows()` is the next timing layer after native sensor readout timing.

It treats the **opening and closing exposure edges separately**. Each edge can be simultaneous, or a caller-declared uniform-linear scan in fixed native sensor coordinates. The nominal exposure duration is another independent time value with its own evidence.

The output time reference is the **first opening edge**. This does not claim that every native location starts exposing at the same moment. For each point, the local start and end offsets are derived independently, and the engine reports the local exposure duration.

The shutter mechanism only decides which actuator owns each edge. It does not invent travel timing:

- mechanical: mechanical opening and closing;
- EFCS: electronic opening, mechanical closing;
- electronic: electronic opening and closing.

The whole active rectangle is validated, so a zero or negative local exposure duration cannot hide in a region that was not sampled.

This contract stays separate from `calculateSensorReadoutTiming()`: sensor readout phase is not automatically an exposure edge. It also stays separate from `calculateCameraRotationImageMapping()`. That API still takes seconds from its own exposure-start reference; the capture rotation and production adapters explicitly bind local capture-window times to that motion timeline.

The first exposure-window model does not include curtain acceleration, non-linear or segmented electronic scheduling, shutter shock, or EFCS-specific pupil and bokeh effects. Rolling-shutter distortion and flicker banding are not separate warps. They emerge when each site's window carries its line offset; see [Electronic rolling-shutter image formation](#electronic-rolling-shutter-image-formation).

## Electronic rolling-shutter image formation

**Background.** Every native site already has its own local exposure window, and every image-formation consumer samples time inside that window:

- the environment RAW path (`simulateEnvironmentSensorRawFrame`, `createNativeEnvironmentRawTask`, the browser-native reference executor) queries scene radiance and camera rotation at each site's own midpoint times;
- the production plan's rotation quadrature uses the same windows;
- `integrateSceneIlluminationTemporalMultiplierOverExposureWindow()` integrates source waveforms over them.

What was missing was the **row offset itself**. A rolling readout declaration described only sensor data readout, so with simultaneous exposure edges every row saw the same window.

**The model.** `resolveElectronicRollingShutterExposureSchedule()` is the explicit linkage model (`electronic-rolling-shutter-line-reset-read` 1.0.0) for a fully electronic, line-by-line CMOS rolling shutter. Each line is reset, collects light for the exposure time `T`, and is then read. The reset pointer runs `T` ahead of the read pointer, and both advance at the line rate (El Gamal & Eltoukhy 2005; Liang, Chang & Chen 2008). With the uniform-linear scan used throughout this engine:

```text
s       = normalized scan position of the native point along the readout direction, s ∈ [0, 1]
          (top-to-bottom: s = (y − rect.y)/rect.height; bottom-to-top: 1 − that; same for columns)
τ       = declared first-to-last spatial sampling skew of the rolling readout (active capture)
window  = [s·τ, s·τ + T]            local duration = T for every line
```

So both exposure edges become uniform-linear scans in the readout direction, with travel time `τ`.

**Using it.** The schedule is a complete exposure schedule (`createRollingShutterCaptureExposureSchedule()`). Pass it unchanged as:

- a native RAW or environment `exposureWindow`; or
- a production `temporalCapture.exposureWindowInput`, together with `readoutExposureLinkage: { kind: "electronic-rolling-shutter-line-reset-read", evidence }`.

The plan then checks that the schedule is exactly the one derived from its rolling readout (`isElectronicRollingShutterExposureSchedule()`), and reports `readoutExposureSynchronization: "electronic-rolling-shutter-line-linked"`. Without the linkage it keeps `"not-assumed"`, and global behaviour is unchanged.

**What emerges.** These effects now come out of per-site sampling, with no image warp drawn afterwards:

- **Skew of moving subjects.** A vertical edge moving horizontally at `v` native pixels per second is recorded by line `y` at time `s(y)·τ + phase·T`. So it appears shifted by `Δx(y) = v·τ·(y_center − y_ref)/H` between lines (H = active rows). Top-to-bottom readout shears it one way and bottom-to-top the other. A global (simultaneous) schedule leaves it unsheared. `test/rolling-shutter-image-formation.test.ts` recovers this shear exactly (to 1e-10 px) from the photon expectations of the full environment RAW path.
- **Camera rotation and translation wobble.** Rotation and translation are evaluated at each line's own times. Yaw at `ω` adds `ω·Δt` of angle between lines that are `Δt = τ·Δs` apart (verified on the environment queries and the production rotation quadrature). A varying angular velocity would cause wobble; the current motion inputs have constant rate, which gives a pure skew.
- **Partial exposure.** A source that exists for less than `τ + T` (a flash, a passing object) is captured only by the lines whose windows overlap it.
- **Flicker banding.** A periodic source with period `P`, integrated over `[s·τ, s·τ + T]`, varies with `s`. The band pattern repeats every `H·P/τ` rows. It disappears when `T` is a whole multiple of `P`, because the integral of a periodic waveform over whole periods does not depend on phase. Mains-powered lamps commonly flicker at twice the mains frequency, because emitted power follows the square of a sinusoidal current or voltage (sin²ωt = (1 − cos 2ωt)/2; context in the US DOE temporal light modulation pages; also IEEE Std 1789-2015). Poplin (2006) describes the banding mechanism in line-by-line CMOS capture.

**Limits.**

- Uniform line rate, and no reset jitter.
- No hybrids such as global reset with rolling release, or electronic start with mechanical close.
- `τ` is a declared value for the active capture area. It is never scaled from a full-frame figure.
- The data-readout duration still never validates the linkage.
- Mechanical and EFCS shutters keep their own declared curtain schedules.

## Video frame sequences

`resolveVideoFrameSequence()` turns the existing `"video"` optical capture state (`OpticalProfileState` with `captureMode: "video"` and `frameRateHz > 0`) and a shutter angle into ordinary `ResolvedReleaseFrame`s. `createProductionCaptureSnapshotFromReleaseFrame()` consumes these unchanged.

```text
frame period          = 1 / f
exposure (angle θ)    = (θ / 360) / f              θ ∈ (0°, 360°]
frame k opens at      = k / f                      seconds from sequence start (absolute index k)
frame k seed          = MurmurHash3_x86_32(sequenceSeed, k, 0x56494446 "VIDF")
rolling line s, frame k integrates [k/f + s·τ, k/f + s·τ + T],  requires τ ≤ 1/f
```

**Shutter angle.** `calculateShutterAngleExposureSeconds()` and `calculateShutterAngleFromExposureSeconds()` implement the shutter-angle relation of a rotary shutter, or an electronic equivalent (*American Cinematographer Manual*).

`assessShutterAngleRule()` compares an angle with the **180° rule** (`T = 1/(2f)`) and reports the signed difference in stops. The rule is a filmmaking convention about how motion blur looks, not physics, and the result says so (`conventionNotPhysics: true`). For example, 24 fps at 172.8° gives `T = 1/50 s`, a common choice because it integrates whole 100 Hz flicker periods.

**Frame-to-frame determinism.** Frame start, exposure, seed and schedule depend only on the inputs and the absolute frame index. They never depend on earlier frames or on how the work is chunked. Resolving frames 0–9 at once gives the same result as resolving 0–3, 4–6 and 7–9 separately (tested). Frame times use `k / f` directly rather than adding up intervals, so floating-point error does not grow along a clip. Each frame's per-site noise streams are then derived from its own seed by the existing per-site MurmurHash3 schedule.

Not modelled: frame-rate drift, dropped or variable-rate frames, automatic exposure changes between frames, sensor-mode switching, compression and encoding, and temporal noise reduction.

## Capture rotation exposure trajectories

`calculateCaptureRotationTrajectories()` is the first explicit link between local capture exposure windows and the existing pure-rotation mapping.

For each native raster point the caller selects, the engine:

1. finds the point's local exposure start and end with `calculateCaptureExposureWindows()`;
2. maps that native point into the image plane before orientation, at the **first opening edge**;
3. explicitly sets that capture reference as `t = 0` of `calculateCameraRotationImageMapping()` for this calculation;
4. evaluates the same stationary world ray at the local exposure start and end;
5. reports the two mapped end points and the straight line (chord) between them on the image plane.

The output is deliberately a **forward trajectory of a stationary reference ray**. It is not a rolling-shutter image warp.

Why the distinction matters: in a rolling capture, the capture time depends on image location, while camera motion also changes where a world ray lands. A renderer-ready rolling-shutter transform therefore needs a self-consistent inverse mapping, from destination to source. One forward displacement evaluated at a destination coordinate is not enough.

The end-point chord is also **not a blur kernel**. Pure rotational image motion can follow a curved path on the image plane, and exposure integrates radiance over the whole local interval, not just its two ends.

Sensor data-readout timing from `calculateSensorReadoutTiming()` is deliberately not used. A particular electronic capture mode may have a documented relationship between sensor readout and the exposure edges. Photivra requires that relationship to be declared explicitly, rather than assuming it always holds.

This trajectory model is still rotation-only. Future work: camera translation and parallax, subject motion, panning intent, object rotation or deformation, occlusion changes, exposure integration, flash and flicker, shutter shock, and the final inverse rolling-shutter warp.

## Capture rotation temporal quadrature

`calculateCaptureRotationTemporalQuadrature()` extends the instantaneous inverse mapping (next section) to a fixed set of time samples over each destination point's whole local exposure interval. In numerical terms it is a **temporal-geometry quadrature**.

The first model uses the uniform midpoint rule. For `N` time samples, the normalised local phases are:

```text
phase_i = (i + 0.5) / N
```

so the exact opening and closing edges are not sampled. Each phase is evaluated through the existing public `calculateCaptureRotationInverseMappings()` contract. No second camera-motion equation is introduced.

Every time node reports two different measures:

- `normalizedTimeWeight = 1 / N`: a dimensionless weight for a downstream **time average**, under the declared assumption of uniform response over time.
- `timeMeasureSeconds = localExposureDuration / N`: a `dt` in seconds for a downstream **time integral**.

These are kept apart on purpose. The seconds value is not shutter transmission, photon count, radiometric throughput, scene radiance, sensor response or a calibrated energy.

The local exposure interval still depends on the destination point. A scanned opening or closing schedule can therefore shift node times between sensor locations. Different opening and closing travel schedules can give different local durations, and so different `timeMeasureSeconds` values.

The first time-response model is `uniform-over-local-exposure`. This is an explicit approximation. This geometric primitive does not model shutter-transmission ramps or exposure-dependent sensor response. Changing light is integrated separately, by registered temporal illumination and manual flash and by the explicit scene/EQE exposure APIs. Geometry nodes on their own apply no radiometric weighting.

The API returns **nodes and weights only**. It does not:

- average reference coordinates;
- compute a blur radius or kernel;
- sample scene radiance;
- resolve visibility or occlusion;
- write output pixels.

Averaging geometric coordinates is no substitute for integrating the radiance seen along rays that change over time.

No geometry-only quadrature error estimate is reported. The error of the integrated image depends on scene radiance, visibility, texture and edge frequency, and reconstruction, as well as the camera path. When convergence evidence is needed, renderer or reference implementations can compare increasing sample counts in their radiance results.

## Instantaneous capture rotation inverse mapping

`calculateInverseCameraRotationImageMapping()` is the exact inverse of the existing forward pure-rotation ray mapping, under the same constant-axis assumptions. Once the capture time is known, the captured image-plane ray is rotated analytically back into the camera frame at the start of exposure. There is no numerical root-finding or fixed-point solve.

`calculateCaptureRotationInverseMappings()` combines that inverse with local exposure-window timing. For each destination point on the native sensor:

1. the destination point selects its local exposure window;
2. the caller supplies `localExposurePhase` in `[0, 1]`;
3. capture time is `start + phase × localDuration`;
4. the destination native point is mapped into the ideal image plane before the lens;
5. the captured ray is inverted analytically to the reference frame at the first opening edge;
6. displacements are reported on the image plane, in native effective samples, and in physically oriented samples.

The phase is required because a finite exposure has no single sharp geometry. Phase `0` is the local exposure start, `0.5` is the local midpoint and `1` is the local exposure end. None of these is automatically "the" final rendered image.

This inverse is renderer-oriented only in one limited sense: it maps a **destination capture location to a reference ray**. It is still not a finite-exposure renderer. Motion blur needs integration over the local interval, with an explicit exposure-weighting model if the weighting is not uniform.

Sensor data-readout timing is still not used. A documented mode-specific relationship may later link readout and electronic exposure timing, but no such equality is assumed here.

The mapping is evaluated in the ideal image plane before the lens. Radial distortion, chromatic aberration, PSF, output crop and resampling, camera translation and parallax, subject motion, occlusion changes, flash and flicker, and shutter shock are all separate stages.

Reference rays are not clamped to the available source frame. With camera motion, a valid captured destination can map to reference geometry outside the reference image. A renderer must treat that as missing source coverage, not silently stretch or clamp edge pixels.

The current inverse does not claim that any rolling or scanning camera is one-to-one everywhere. More general motion can produce folds, repeated visibility or other multi-perspective effects. Those cases need their own validity analysis; they are not covered by this pure-rotation model.

## Temporal image-formation basis

The image-formation contract measures physical time in **seconds from the start of exposure**.

The camera-rotation model can be evaluated at any supported physical time, rather than returning one finished full-frame displacement. This lets both global exposure and rolling readout use the same camera-motion model.

Exposure duration and sensor readout timing are independent concepts:

- a global readout can still contain subject or camera motion blur;
- a rolling readout changes the exposure and readout schedule across the sensor;
- physical orientation does not change the native sensor scan direction;
- depth-dependent camera translation is not part of the first rotational-flow model, because parallax depends on scene depth.

## Exposure relations

`calculateExposureValue100()` computes EV100 (exposure value at ISO 100) from aperture and shutter duration.

`calculateRelativeOpticalExposure()` compares exposures using the proportional image-plane relation `t / N²`.

Neither implies a photon count. They do not include scene radiance, lens transmission (T-stop), vignetting, spectral response or sensor calibration.

`calculateRelativeRenderedExposure()` combines relative optical exposure with the nominal ISO gain ratio (`iso / referenceIso`). It reports both the linear factor and the difference in stops. It is meant for deterministic relative rendering against a declared reference, not radiometric calibration. It does not model photon creation, sensor noise, clipping, tone mapping or lens transmission.

`calculateEquivalentIso()` treats ISO as the nominal gain (brightness compensation) needed to keep the rendered exposure the same after an aperture or shutter change. It is not used as a shortcut for noise or photon creation.

## Signal/noise primitives

The root package also exports two low-level, deterministic sensor primitives:

- `calculatePhotoelectrons()`: the caller's mean incident photon count × the caller's quantum efficiency (QE).
- `calculateSignalToNoise()`: Poisson shot-noise standard deviation plus independent RMS read noise from the caller, reported as linear SNR and in dB.

These functions do **not** derive photon counts from scene images.

These two scalar primitives do not model dark current, fixed-pattern noise, PRNU/DSNU (pixel response and dark signal non-uniformity), ADC quantisation, clipping or full-well behaviour, CFA (colour filter array) and demosaic, downstream denoising, or any particular commercial sensor. The per-site RAW readout chain below does model dark current, optional fixed-pattern noise, ADC quantisation and saturation. It still does not model blooming or any particular commercial sensor.

## ISO gain, fixed-pattern noise and dark-current temperature (2.0.0)

### ISO maps to analog and digital gain

ISO is never an equation inside the readout. Instead, an ISO signal chain (`resolveGenericIsoSignalChain`) binds each exposure-index setting to an explicitly declared readout regime.

`createIsoGainReadoutRegimes()` derives one regime per setting from declared parameters. It uses the linear camera model of EMVA Standard 1288 Release 4.0 (system gain K in DN/e⁻; stored here as its reciprocal, electrons per code), and the exposure index S = 10/H of CIPA DC-004-2020 (free; also ISO 12232:2019):

| Quantity | Equation |
|---|---|
| exposure-index ratio | R = S / S₀ (S₀ = base exposure index) |
| analog gain | a = min(R, A_max) |
| post-ADC digital gain | d = R / a (1 inside the analog range) |
| electrons per code | g(S) = Q₀ / (span · a), span = digitalSaturationCode − blackLevelCode |
| pre-ADC threshold | Q_preADC(S) = Q₀ / a |
| electrons reaching digital white | Q₀ · S₀ / S |

**Why brightness stays consistent.** The exposure indices of CIPA DC-004, standard output sensitivity (SOS) and recommended exposure index, both put the reference exposure at H = 10/S, so H ∝ 1/S. Under this model, an exposure that is correct for S gives the same black-subtracted fraction of the white level at every S. At a fixed exposure, the RAW code doubles per stop until it clips.

`test/iso-brightness.test.ts` checks, for every generic tier and ISO:

- that an SOS mid-grey exposure H_m = 10/S, which DC-004 places at an 18 % grey when white corresponds to a 100 % reflector (so 0.18 of the white exposure), normalises to 0.18, within 1e-9 in the expectation, and within 6σ shot noise plus quantisation in noise-free quantised codes;
- that a clipped site normalises to 1;
- that brightness is monotonic.

**Read noise.** Read noise in electrons is declared for each conversion-gain mode; it is never derived from S. A dual-conversion-gain sensor is represented by two modes: a low-conversion-gain mode at low S, and a high-conversion-gain mode from a declared switch-over exposure index, with lower input-referred read noise and an optional storage limit. These are explicit preset parameters, not a claim about any camera.

**The readout chain**, in order:

1. realised charge;
2. physical clamp;
3. read noise + fixed-pattern row/column offset;
4. pre-ADC threshold;
5. code = signal/g + black + INL(code);
6. round half up (exact ties toward +∞, `Math.round`);
7. optional digital gain d about black, re-quantised;
8. clamp to [0, digitalSaturationCode].

Digital gain leaves missing codes, as on real cameras. The noise-free code of a saturated site is therefore
`min(digitalSaturationCode, round((min(adcMax, round(black + min(capacity, Q_preADC)/g + INL)) − black) · d + black))`.
When d = 1 and no INL is declared, it reduces to `min(digitalSaturationCode, round(black + min(capacity, Q_preADC)/g))`.

**ADC non-linearity.** `adc.integralNonLinearity` optionally adds a piecewise-linear INL (integral non-linearity) offset, in code units, before quantisation. Its knots run from code 0 to the ADC maximum. EMVA 1288 characterises the resulting linearity error.

**No blooming.** Blooming is **not** modelled. Each native site is computed independently, in tile order. Charge spilling into vertical neighbours would need a second frame-wide pass over overflow charge from sites in other tiles. That would break the per-site, tile-independent reference design and bit-identical chunking. So the model stays a scalar physical clamp with an overflow diagnostic.

### Fixed-pattern noise

`SensorFixedPatternNoiseProfile` (model `photivra-sensor-fixed-pattern` 1.0.0) is an optional spatial pattern belonging to one sensor instance, using EMVA 1288 definitions.

Its values come from MurmurHash3 streams keyed by the sensor-instance seed, the absolute colour-sampling site x and y, and a stream number. They never use the capture seed, so the same sensor shows the same pattern in every capture.

- **PRNU** (photo response non-uniformity): gain g = max(0, 1 + σ_PRNU·z) multiplies the expected photo charge before Poisson sampling.
- **DSNU** (dark signal non-uniformity): factor max(0, 1 + σ_DSNU·z) multiplies the population-mean dark expectation before dark Poisson sampling.
- **Hot pixels:** a fraction f of sites uses a declared dark-current multiplier instead. Because both act on the dark expectation, the excess scales with exposure time and with the dark-current temperature model.
- **Row and column offsets:** fixed normal offsets (σ_row, σ_col, in input-referred electrons) shared by a whole row or column. They are added with read noise, before the pre-ADC threshold.

The thermal dark-current contract stays a population mean (`spatialDarkCurrentNonuniformityModeled` is unchanged). This is a separately attached model. Omitting the profile gives exactly the uniform model. Normal factors are truncated at 0; for σ ≤ 0.2, the resulting bias in the mean factor is below 1e-6.

### Dark-current temperature interpolation

Thermally generated dark current rises roughly exponentially with temperature. This is Arrhenius behaviour, often summarised as doubling every few kelvin (Janesick, *Photon Transfer*, SPIE 2007; EMVA 1288 Release 4.0 dark-current temperature dependence).

The `log-linear-temperature-table` model interpolates ln(rate) linearly between neighbouring declared samples: r = r₀·(r₁/r₀)^α. Each interval follows its own two samples, and no single global doubling temperature is imposed. Rates must be positive, and extrapolation still fails closed.

Example: with 10 e⁻/s at 20 °C and 100 e⁻/s at 40 °C, it gives 31.6 e⁻/s at 30 °C. The legacy `piecewise-linear-temperature-table` gives 55. The legacy kind is still accepted, for callers whose data are better described linearly.

### Poisson sampling at very large means

For means of 1e9 electrons and above, the sampler uses a continuity-corrected normal approximation, k = max(0, ⌊μ + √μ·z + ½⌋). Its skewness error, 1/√μ ≤ 3.2e-5, is negligible at that size. The transformed-rejection sampler (Hörmann 1993) lost precision at 1e14 (var/mean 1.012). Means below 1e9 keep the previous samplers and draws.

The composed POC deliberately does not expose photon or noise output.

**Radiometry-readiness gate.** The root package includes a gate that checks whether a declared package of prerequisites contains: scene spectral radiance, optical transmission, pupil and vignetting behaviour, an explicit definition of photosite collection area, exposure integration, sensor response, evidence, and uncertainty declarations.

Readiness is kept separate from the signal and noise calculations:

- `not-ready`: some prerequisite categories are missing.
- `approximate-only`: all categories exist, but at least one is approximate or has unquantified uncertainty.
- `calibrated-ready`: all categories are declared calibrated, with quantified uncertainty.

These states describe only the declared package. They do not prove a calibration is correct, do not calculate incident photons, and never automatically turn on photon or noise output in `simulatePocCamera()`.

Geometric pixel (sample) pitch is not accepted as a photon-collection area. An explicit effective collection area, or a geometric cell area plus fill factor, is required.

## Provenance

The equations here were implemented independently from established projective geometry, exposure relations and elementary photon and statistical noise models. These modules contain no third-party source code or calibration datasets.

References for the 2.0.0 readout additions (cited as published methods; no text, tables or data are copied):

- CIPA DC-004-Translation-2020, *Sensitivity of Digital Cameras*, free at <https://www.cipa.jp/e/std/std-sec.html> (standard output sensitivity and recommended exposure index S = 10/H, §3.2–3.3).
- EMVA Standard 1288 Release 4.0, *Standard for Characterization of Image Sensors and Cameras* (linear model, PRNU, DSNU, linearity, dark current).
- J. R. Janesick, *Photon Transfer*, SPIE Press, 2007.
- W. Hörmann, "The transformed rejection method for generating Poisson random variables", *Insurance: Mathematics and Economics* 12 (1993).
- G. E. P. Box and M. E. Muller, "A note on the generation of random normal deviates", *Ann. Math. Statist.* 29 (1958).
- N. L. Johnson, A. W. Kemp and S. Kotz, *Univariate Discrete Distributions*, 3rd ed., Wiley, 2005 (normal approximation to the Poisson distribution).

References for the 2.0.0 rolling-shutter and video additions (published methods only; no code, text or data copied):

- A. El Gamal and H. Eltoukhy, "CMOS image sensors", *IEEE Circuits and Devices Magazine* 21(3), 2005 (line-sequential reset/read rolling shutter).
- C.-K. Liang, L.-W. Chang and H. H. Chen, "Analysis and compensation of rolling shutter effect", *IEEE Transactions on Image Processing* 17(8), 2008.
- M. Meingast, C. Geyer and S. Sastry, "Geometric models of rolling-shutter cameras", OMNIVIS 2005 (arXiv:cs/0503076).
- O. Ait-Aider, N. Andreff, J. M. Lavest and P. Martinet, "Simultaneous object pose and velocity computation using a single view from a rolling shutter camera", ECCV 2006.
- D. Poplin, "An automatic flicker detection method for embedded camera systems", *IEEE Transactions on Consumer Electronics* 52(2), 2006.
- US DOE, temporal light modulation (flicker) research pages, <https://www.energy.gov/eere/ssl/flicker> (also IEEE Std 1789-2015, *Recommended Practices for Modulating Current in High-Brightness LEDs for Mitigating Health Risks to Viewers*).
- *American Cinematographer Manual*, ASC Press (shutter angle and the 180° convention).
