# Physics Foundation

Release context: **package 1.2.0 candidate / root API 1.2.0**. Subsystem/model versions and dated introduction or measurement records below are independent historical identities; they are not distribution versions. See [developer navigation](DEVELOPERS.md) and [release contract](RELEASE_1_2_0.md).

Photivra starts with analytical models that can be independently tested and whose assumptions can be stated explicitly.

## Implemented models

### Rectilinear field of view

The rectilinear relation is:

`FOV = 2 atan(d / (2v))`

where `d` is the relevant sensor dimension and `v` is the projection/image-plane distance.

When no focus distance is supplied, `v = f` is the infinity-focus/pinhole compatibility approximation. When focus distance is supplied, `v` is the ideal Gaussian thin-lens image distance.

For a centered sensor interval, the usual symmetric form is sufficient. For an off-center sensor interval, Photivra uses signed sensor-plane bounds relative to the optical axis:

`FOV = atan(x_max / v) - atan(x_min / v)`

This preserves asymmetric left/right or top/bottom angular limits instead of pretending every active crop is centered.

### Sensor geometry, sampling, capture, and crop

Photivra separates physical image-formation geometry from digital sampling.

`SensorImagingArea` represents the physical photosensitive area used for image formation. It is not a sensor package/die dimension.

`NativeImageRaster` represents the effective native image-sampling grid. It does not imply that one output/image sample corresponds one-to-one with one physical photodiode. Generic active/output rasters use `RasterDimensions`.

Geometric sample pitch is derived independently on each axis:

- `pitchX = imagingWidth / nativePixelWidth`;
- `pitchY = imagingHeight / nativePixelHeight`.

These pitches are geometric sample spacing only. They are not fill factor, effective collection area, or photon-collection area.

The capture pipeline is staged:

```text
physical imaging area + native raster
              ↓
native active-capture rectangle
              ↓
physical camera orientation
              ↓
oriented active capture
              ↓
digital/output crop
              ↓
output raster
```

Native raster coordinates use a top-left origin with +X right and +Y down. Integer rectangles are half-open. Physical camera rotation does not redefine the native coordinate system; Photivra transforms points, vectors, and rectangles explicitly between native and oriented coordinates.

For the generic sensor model, active physical dimensions and optical-axis offset are derived by assuming the native sampling grid uniformly spans the declared physical imaging area. This assumption is recorded because a future calibrated camera profile may need explicit physical active-area data instead.

An off-center active rectangle changes both retained physical extent and angular position relative to the optical axis. It must therefore use asymmetric angular bounds rather than a centered FOV formula.

For an off-center rectangular active area, the two opposite-corner diagonal angular spans need not be equal. `calculateActiveCaptureFieldOfView()` reports both and uses the larger span for its compatibility `diagonalDegrees` summary.

Output crop/resampling is digital geometry. It does not mutate physical sensor identity or active-capture geometry. Output raster aspect ratio must remain consistent with the selected output crop; implicit geometric stretching is rejected.

Centered crop dimensions are derived from a linear crop factor while preserving source aspect ratio, subject to integer pixel flooring.

Subject-height framing crop computes the additional same-aspect crop needed to target a requested subject-height fraction. It assumes the crop can be positioned around the subject and does not check subject position against image edges.

### Crop factor and 35 mm-equivalent focal length

Physical crop factor is diagonal-based relative to a 36 × 24 mm reference frame:

`cropFactor = diagonal_35mm / activeCaptureDiagonal`

Conventional 35 mm-equivalent focal length is:

`equivalentFocalLength = actualFocalLength × cropFactor`

The actual focal length remains the optical focal length. Equivalent focal length is a derived framing convention; it does not replace physical focal length in projection or depth-of-field calculations.

Photivra bases equivalence on the active physical capture area, not later digital/output crop. Physical orientation leaves the active diagonal unchanged and therefore does not change diagonal-based equivalent focal length. Different aspect ratios can still produce different horizontal/vertical FOV even when the single diagonal-equivalent number is the same.

### Projection, focus extension, object size, and motion

Field of view, projected fronto-parallel object size, projected representative-point subject motion, and camera-shake projection support two explicit projection modes:

- **pinhole/infinity-focus compatibility mode** when no focus distance is supplied: nominal focal length is used as the projection distance;
- **focus-aware thin-lens mode** when a focus distance is supplied: sensor-plane projection distance is calculated from the Gaussian thin-lens relation `1/f = 1/s + 1/v`.

There is no hidden distance threshold or discontinuous transition between the modes. The caller chooses the model by supplying or omitting focus distance.

At a focus distance of at least 100 focal lengths, the ideal thin-lens projection-distance scale differs from the infinity-focus approximation by no more than about 1.011%. For example, 200 mm focused at 22 m (110 focal lengths) changes projected scale by about 0.92%.

The focus-aware model improves internal consistency with thin-lens DOF/defocus calculations, but it is still an ideal paraxial model. It does not model real-lens focus breathing, pupil magnification, principal-plane movement, distortion, aberrations, or lens-specific macro behavior.

Projected subject motion remains a representative-point displacement model with constant linear world velocity. The separate extended-object projection foundation now evaluates multiple explicit metric points under shared rigid translation, so depth-direction motion can produce spatially varying trajectories and validated planar magnification where appropriate.

### Extended-object projection under rigid translation

A representative point does not fully describe an extended object moving along the optical axis. Under rectilinear projection, an on-axis center point can remain fixed while off-axis points move radially as object depth changes.

The extended-object foundation therefore projects each supplied metric point independently through time.

For a rigid object and translating camera:

```text
relative velocity = object translation - camera translation
position_i(t) = position_i(0) + relative velocity * t
projected_i(t) = v * (x_i(t)/z_i(t), y_i(t)/z_i(t))
```

where `v` is the selected nominal or focus-aware image-plane projection distance.

This first model is deliberately rigid and translational. It does not model object rotation, articulation, deformation or acceleration.

A single uniform magnification is scientifically justified only for a constrained geometry. Photivra therefore reports a planar scale diagnostic only when the caller explicitly declares a fronto-parallel planar patch and every supplied point validates against the same reference depth. Under shared rigid translation the diagnostic scale is:

`reference depth / current depth`

That special-case result does not imply that arbitrary 3D geometry admits one scale or one homography.

When bound to #12, each object point is evaluated on its own local exposure clock. This preserves rolling-capture timing without treating sensor data readout as exposure timing.

The geometry result does not solve visibility. Axial/lateral motion can reveal/hide surfaces or move geometry through frame boundaries; a renderer must evaluate those states explicitly. Similarly, relative depth changes can alter defocus/PSF through the exposure, so a static blur/PSF composition is not automatically valid.

### Mode-bound exposure/readout timing and temporal translation

The #12 closure preserves two different clocks:

1. **local exposure-window timing**, referenced to the first opening-boundary phase; and
2. **sensor data-readout timing**, referenced to its own native readout phase.

A capture-mode timing profile binds both sets of facts to one exact capture-mode/profile identity without asserting that those clocks are synchronized. Global readout removes spatial readout skew; it does not remove finite-exposure motion.

The first supported exposure/readout schedules remain simultaneous or uniform-linear native scans. More complex non-uniform schedules are rejected unless a future explicit model represents them.

Pure camera rotation can be evaluated without scene depth. Camera translation cannot. Under constant translation, a stationary scene point at metric position `(x,y,z)` is evaluated from its relative camera-space position over time, so image displacement scales with scene depth through rectilinear projection. Consequently, arbitrary 3D translation does not admit one globally valid image-plane homography.

Optional subject velocity remains separate from camera translation and composes as relative motion. The model does not reinterpret subject motion as sensor/readout behavior.

Temporal radiance integration uses deterministic midpoint nodes inside each authoritative local exposure interval. Scene-radiance providers must evaluate at those physical capture times; sensor readout timing is not substituted for exposure time. Per-node uncertainty/evidence is preserved, while aggregate uncertainty remains unquantified unless justified correlation assumptions are supplied.

### Manual flash timing and scene-light boundary

The first flash model composes two already-established domains instead of introducing a special image effect:

1. #85 spatial/temporal illumination; and
2. #12 exposure-boundary timing.

A short manual-flash pulse is an aperiodic relative illumination waveform attached to an explicit spatial source. The source geometry therefore remains available to the scene-radiance transport layer for distance, surface-angle, visibility/shadow, and indirect-light behavior.

Ordinary full-frame flash synchronization requires a non-empty interval where every point in the active capture is simultaneously exposed. For the currently supported simultaneous or uniform-linear boundary schedules:

- latest opening phase is zero for a simultaneous opening, otherwise the declared opening traversal duration;
- earliest closing phase is the nominal closing reference;
- ordinary one-pulse sync is valid only when the complete pulse support lies inside that interval.

This rule is derived from exposure boundaries, not sensor data readout.

Front- and rear-curtain modes differ only in where the same pulse support is registered inside that valid interval. Their different relationship to subject motion/ambient trails must emerge from time-dependent scene-radiance integration rather than drawing a synthetic trail.

Flash duration and shutter duration remain independent. Extending the shutter can integrate more ambient scene time without proportionally increasing a fixed short flash pulse.

Schema 0.1.0 intentionally excludes HSS. A moving-slit exposure with no whole-frame-open interval cannot be made ordinary-flash-compatible by relabeling a single pulse as HSS.

Manual flash also excludes TTL/preflash metering, recycle/thermal behavior, flash exposure lock, red-eye/modeling/AF-assist emissions and branded protocols. Camera WB remains downstream interpretation and never changes the emitted flash spectrum.

### Generic illumination vignetting

The engine exposes a generic rotationally symmetric **relative linear illumination** model:

```text
T(rho) = 1 + r2*rho² + r4*rho⁴ + r6*rho⁶
```

where `rho` is ideal image-plane field radius divided by the caller-declared physical normalization radius.

The optical axis is normalized to `T(0) = 1`.

The declared `maximumNormalizedRadius` is a scientific operating envelope. Photivra evaluates the polynomial endpoints and all real internal extrema over the full interval and rejects profiles that:

- produce zero/negative throughput; or
- exceed the center-normalized throughput of 1.

The result is a linear-light multiplicative attenuation plus equivalent positive stop loss.

This slice is **not mechanical/pupil vignetting**. It does not clip the pupil or change bokeh/PSF shape. It also does not claim calibrated radiometry or named-lens behavior.

### Generic lateral chromatic aberration

The standalone lateral-CA foundation uses the green channel as the reference field mapping.

A shared base radial-distortion profile defines the common geometric lens mapping. Red and blue coefficient offsets are added to that base before each channel is mapped:

```text
green coefficients = base
red coefficients   = base + red offset
blue coefficients  = base + blue offset
```

This keeps ordinary geometric distortion and lateral chromatic separation distinct while allowing one renderer pass to consume the combined per-channel mapping.

The model deliberately does **not** represent CA as finished-image RGB blur. Forward mapping reports per-channel field coordinates and vector separation; inverse mapping reports the per-channel ideal source coordinate required for one distorted destination.

All combined channel profiles share one physical normalization radius and operating envelope and must remain individually invertible.

The RGB labels are representative renderer channels only. The model does not define wavelengths, sensor CFA responses, longitudinal chromatic aberration, wavelength-dependent PSFs, or calibrated real-lens color behavior.

### Generic radial distortion

The engine includes a standalone rotationally symmetric radial field-mapping approximation:

```text
p_distorted = p_ideal × (1 + k1 r² + k2 r⁴ + k3 r⁶)
```

where `r` is image-plane radius divided by a caller-declared physical normalization radius.

The declared `maximumNormalizedRadius` is part of the scientific contract. Photivra checks the derivative of the radial mapping over that interval and rejects profiles that are not strictly one-to-one. This makes deterministic inverse destination-to-source sampling well-defined.

The model is centered on the optical axis and does not yet include tangential/decentering terms. Coefficients are generic inputs, not real-lens calibration data.

### Declared-scale focus breathing

The root engine exposes a generic focus-breathing projection approximation.

For one selected focus state:

```text
effective projection distance
  = ideal thin-lens image distance × caller-declared breathing projection scale
```

Scale `1` exactly preserves the existing thin-lens projection.

The model intentionally does not infer a focus-breathing curve. It represents focus-dependent framing/magnification only when the caller supplies the scale for that state. Physical focal length remains unchanged.

This simplified scale does not model principal-plane movement, pupil magnification, distortion, aberrations, or a named commercial lens. Those require separate models and, for calibrated profiles, defensible provenance.

### Thin-lens focus and depth of field

The geometric depth-of-field model uses the conventional hyperfocal/near/far equations with a caller-supplied acceptable circle of confusion.

The circle-of-confusion criterion is a viewing/acceptability input, not a physical sensor threshold. The optional equivalent-viewing helper scales a caller-supplied reference criterion by sensor-diagonal ratio and is explicitly labeled an approximation.

In composed POC capture mode, the equivalent-viewing helper uses the final retained physical image region that will be enlarged to the assumed final viewing size. Active capture, digital output crop, and centered subject framing can therefore change the viewing criterion; output pixel resolution alone cannot. This changes only the viewing/acceptability convention, not the physical optical blur. An explicit caller-supplied `circleOfConfusionMm` is never rescaled.

The model is not a macro calibration model and does not include diffraction, pupil magnification, aberrations, focus breathing, or lens-specific principal-plane behavior in its DOF criterion.

### Focus-control state versus optical focus

Focus control is a camera-control state machine, not a blur algorithm.

The #104 layer resolves a target/control event into the existing #103 `FocusPlane`. Downstream thin-lens, defocus and PSF calculations therefore depend only on the resulting finite/infinity optical focus state, not on whether that state came from MF, AF-S, AF-C or focus lock.

Finite autofocus target distance uses the same longitudinal camera-space/conjugate distance convention as #103. Off-axis points on one fronto-parallel plane therefore resolve to the same ideal focus distance; renderer ray length is not an autofocus distance.

The first autofocus actuator is an explicitly ideal instantaneous approximation. It supplies deterministic state semantics without modeling motor dynamics, AF sensor error, hunting, subject-recognition quality, low-light behavior or branded-camera performance.

Single AF acquires once and holds. Continuous AF can consume time-ordered observations of one stable target identity. Target loss holds the last focus and requires an explicit reacquisition event; the engine never silently jumps to another subject.

Focus lock freezes the resolved optical state independently from AE, metering and white balance. Release-priority policy is evaluated by a separate gate and cannot alter the optical focus calculation.

### Defocus circle

Defocus is calculated geometrically by comparing the selected sensor plane for the focus distance with the ideal image plane for the subject distance and projecting an ideal circular entrance-pupil cone to the sensor.

### Real-lens sampled PSF and complex-pupil propagation

The #113 framework adds explicit combined primary-optical PSF representations without redefining the existing geometric-defocus or circular-Airy diagnostics.

A sampled PSF is a full 2D unit-energy intensity distribution in image-plane metric coordinates. Regular-grid interpolation is bounded across focal length, focus state, aperture, field X/Y, wavelength and signed image-plane defocus. The engine never extrapolates beyond declared profile support.

Field curvature and longitudinal chromatic focus are represented as field-/wavelength-dependent best-focus image-plane offsets. They do not modify distortion or lateral-CA coordinates.

A complex pupil stores relative amplitude plus optical-path difference. The reference evaluator uses scalar Fraunhofer propagation:

`PSF ∝ |FT{ A(x,y) exp(i 2π OPD(x,y)/λ) }|²`

and then normalizes the sampled intensity to unit energy. Diffraction and aberration are therefore evaluated together in this path rather than composed as two unrelated image-space blur kernels.

Mechanical pupil clipping may be represented in the pupil amplitude/PSF shape, but relative pupil throughput is an explicit separate factor. This prevents the normalized PSF from absorbing throughput that #110 would later apply again.

MTF magnitude alone cannot uniquely determine a PSF because phase is absent. Photivra therefore accepts MTF magnitude as diagnostic/validation data but never reconstructs a unique PSF from it.

Lens PSF remains upstream of the sensor optical stack, sensor sampling and reconstruction. Stray light is also separate because ghosts and veiling glare are not ordinary primary-image PSF blur.

### PSF/pupil foundation

The engine now exposes a PSF/pupil foundation that evaluates existing geometric defocus and circular diffraction diagnostics in one explicit context while keeping the numerical contributions separate.

The context declares:

- physical image-plane field position;
- a comparison-only field normalization radius;
- focus and subject depth;
- monochromatic wavelength basis;
- ideal circular f-number-derived pupil size.

The current foundation does **not** calculate a combined point-spread function or MTF. Defocus-circle diameter and Airy first-zero diameter are not added together or collapsed into one sharpness value.

The dedicated ideal-polygon API evaluates on-axis non-circular diffraction density; the real-lens framework owns explicitly profiled pupil clipping, field curvature, aberration and bokeh. None is silently combined by the legacy diagnostic calculator. See [PSF and Pupil Foundation](PSF_FOUNDATION.md).

Illumination vignetting remains outside the PSF contribution list because it is currently modeled as throughput-only.

### Diffraction

For an ideal circular aperture, first-zero Airy diameter is:

`d = 2.44 λ N`

where `λ` is wavelength and `N` is f-number.

This is a monochromatic, ideal-circular-pupil diagnostic.

It is deliberately separate from regular-polygon aperture geometry used for bokeh/sunstar exploration. Supplying a polygon blade count does not convert the circular Airy result into a polygon-aperture diffraction PSF. Use `calculateIdealPolygonDiffractionPsf()` with an explicit physical equal-area pupil, propagation distance and wavelength for the ideal on-axis polygon model; arbitrary real diaphragms remain outside that model.

### Ideal diaphragm geometry and sunstar symmetry

For a regular straight-edged diaphragm, the engine calculates normalized polygon vertices and idealized sunstar direction symmetry perpendicular to blade edges.

For even blade counts, opposite parallel edges produce overlapping opposite directions, yielding the same number of unique directions as blades.

For odd blade counts, there are no parallel opposite-edge pairs, yielding twice as many directions as blades.

This is a geometry/orientation model only. It does not calculate diffraction intensity, wavelength-dependent star length, blade curvature, coatings, internal reflections, lens aberrations, sensor blooming, or a complete point-spread function.

### Controlled camera shake

Yaw and pitch angular velocity are integrated over shutter duration. Their angular displacement is projected to the image plane using the selected projection distance.

The current model returns one global image-plane vector. It does not compute the spatially varying optical flow that a real camera rotation produces away from the optical axis.

Equivalent stabilization stops attenuate angular displacement by `2^-stops`; that attenuation is explicitly an educational approximation rather than a real IBIS/OIS or CIPA performance model.

### Sensor stochastic readout and RAW boundary

The #14 closure separates deterministic expectation calculations from stochastic realizations and from digital encoding.

Expected photo, dark and additional stored charge remain upstream scientific quantities. A seeded realization may sample photo/dark Poisson statistics and explicitly declared additional-component statistics without mutating those expectation APIs.

Electronic read noise is a downstream input-referred stochastic contribution and remains separate from photon/dark shot noise. Multiple declared RMS read-noise components are sampled independently; their metadata is not collapsed into a claim about physical circuit origin unless evidence says so.

The electronic chain preserves separate saturation domains:

1. physical charge-storage capacity;
2. pre-ADC electron-equivalent saturation;
3. ADC/digital code saturation.

A scalar clamp at physical capacity is not a blooming model. Blooming requires spatial charge-transfer/adjacency and anti-blooming semantics.

Conversion gain is expressed as electrons per digital code for one explicitly selected operating regime. The engine does not infer that regime from ISO, CMOS/CCD family, capture-mode labels, or product tier.

RAW codes retain absolute native sensor/CFA coordinates. Capture orientation and final output rotation do not rotate or re-phase the sensor mosaic.

The first reconstruction model is an explicit linear native-neighborhood transform tied to exact capture-mode and CFA identities. It is intentionally not a generic claim that a CFA name determines a demosaic algorithm. It also does not claim moiré/aliasing physics unless an adequate pre-sampling optical/scene spatial-frequency model exists.

### ISO/exposure-index and sensor-readout boundary

ISO/exposure index is a camera control/reporting state, not a photon source.

For fixed scene radiance, aperture, shutter duration, optical transmission and sensor collection geometry, changing ISO does not change the number of photons that arrived during the exposure. Accordingly, #7 never modifies upstream photon/photoelectron expectation or photon shot-noise statistics merely because a different ISO/EI was selected.

The detailed ISO capability contract distinguishes:

- standard exposure-index settings;
- expanded low/high reported settings;
- Auto ISO eligibility/ranges;
- optional capture-mode restrictions.

It does not infer physical gain, conversion gain, read noise or saturation from those numbers.

When generic high-ISO behavior is needed, #7 maps an explicit ISO/capture-mode state to an explicit #14 readout regime. The selected regime—not the ISO number itself—contains the declared conversion gain, electronic read noise and downstream saturation/ADC behavior. This keeps piecewise or dual/multiple-gain behavior representable without smoothing it into a universal ISO→noise curve.

Good/Better/Best labels are convenience mappings to full signal-chain profile identities. They are not sensor equations and do not rank real cameras. Sensor size/resolution, photon shot noise, processed-image denoising/sharpening, and technology-family labels such as CMOS/CCD remain separate domains.

### Radiometry readiness boundary

Absolute scene luminance or relative exposure alone is not enough to derive a defensible photon count.

Before a composed photon simulation, Photivra requires an explicit prerequisite package covering:

- scene spectral radiance or a documented spectral approximation;
- optical transmission;
- pupil/vignetting behavior;
- photosite collection-area semantics;
- exposure integration;
- sensor spectral response / quantum efficiency;
- evidence and uncertainty/limitation metadata for each component.

`assessRadiometryReadiness()` can classify a declared package as `not-ready`, `approximate-only`, or `calibrated-ready`. This classification validates the declared model/evidence structure; it does not prove that the calibration is scientifically correct and does not itself calculate photons.

Geometric sample pitch is intentionally insufficient as a collection-area model. A profile must provide either an effective collection area or geometric cell area plus explicit fill factor.

Approximate inputs remain approximate even when every prerequisite category is present. A calibrated-ready declaration requires calibrated components with quantified uncertainty.

The composed POC continues to emit no photon/photoelectron/SNR output from scene settings. Low-level `calculatePhotoelectrons()` remains a separate primitive for callers that already possess a defensible incident-photon count and QE.

## Image-formation domain boundary

Future optical and sensor models must follow `getImageFormationContract()`.

The contract intentionally avoids describing all image formation as independent serial post-processing. Some quantities are coupled:

- focus-dependent projection and lens mapping;
- wavelength-dependent field mapping and PSF basis;
- pupil clipping, throughput, and bokeh/PSF shape;
- time-varying scene/camera mapping and sensor readout schedule;
- native sensor sampling and reconstruction.

Current analytical primitives remain valid and separately named. Adding a broader stage must not silently reinterpret existing focal length, defocus, diffraction, motion, crop, or sensor-sampling outputs.

The static ordering contract retains broad foundation/reserved metadata. Those labels alone do not establish execution. Production plan 0.7.0 separately records actual bounded environment-route execution through sampling, photons, charge, ADC and reconstruction; broader unsupported models remain blocked.

## Source provenance

These implementations were written independently from established mathematical/physical relations. No third-party source code, calibration dataset, table, or model weight is incorporated by these scientific modules.

Public technical references may be used to understand or validate concepts, but their code, protected prose, tables, figures, or restricted measurement data are not copied unless separately licensed for that use. See [Scientific and Source Provenance](PROVENANCE.md).

## Scope

These models produce numerical indicators, not a universal "sharpness score." Sampling, defocus, diffraction, subject motion, and camera shake describe different physical effects and should not be directly added together without a justified image-formation model.

Rendering and analysis clients should consume validated numerical outputs rather than silently introducing conflicting camera science.
