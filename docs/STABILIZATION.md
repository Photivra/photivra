# Camera Shake and Stabilization

Release context: **package 1.0.1 candidate / root API 1.0.1**. Subsystem/model versions and dated introduction or measurement records below are independent historical identities; they are not distribution versions. See [developer navigation](DEVELOPERS.md) and [release contract](RELEASE_1_0_1.md).

Photivra separates deterministic projection geometry from a deliberately simplified educational stabilization model.

## Controlled camera shake

`estimateCameraShakeBlur()` accepts constant camera angular velocity around two axes:

- yaw, in radians per second;
- pitch, in radians per second.

For shutter-open duration `t`, each angular displacement is:

`theta = angularVelocity * t`

The image-plane component is projected as:

`d = v * tan(theta)`

where `v` is the projection distance in millimetres.

Projection has two modes:

- without `focusDistanceM`, `v` is nominal focal length (the infinity-focus compatibility approximation);
- with `focusDistanceM`, `v` is the ideal Gaussian thin-lens image distance for the selected focus plane.

When pixel pitch is supplied, the same displacement is also reported in sensor pixels.

The returned X/Y shake components are expressed in the primitive's sensor/image-plane axes. `estimateCameraShakeBlur()` does not accept `CaptureOrientation` and does not rotate its vector into portrait/oriented output coordinates. A caller combining this primitive with the capture-orientation layer must explicitly transform the vector with the orientation helpers.

The supplied shake profile is synthetic input. The model is not an empirical statement about how much a particular photographer shakes.

### Spatial limitation and the separate rotation primitive

`estimateCameraShakeBlur()` intentionally remains one global image-plane yaw/pitch vector for backwards compatibility with the existing stabilization-equivalent teaching model.

The root engine now separately exposes `calculateCameraRotationImageMapping()`, which models field-position-dependent **pure camera rotation** for yaw/pitch/roll at arbitrary physical time from exposure start.

The two APIs do not share sign semantics:

- the legacy shake estimator preserves its historical direct image-plane displacement convention;
- the spatial rotation primitive represents physical camera rotation using right-hand pitch/yaw/roll, then maps a stationary world ray through the inverse camera rotation.

Do not substitute one result for the other without an explicit migration.

The spatial primitive does not apply stabilization stops. The separate time-domain stabilization system now provides generic synthetic rotational IBIS/OIS/coordinated correction; translation/parallax and mechanism-specific ray-geometry effects remain separate.

## Time-domain physical stabilization system

The #97 foundation adds a separate, versioned physical-stabilization model for time-varying rotational disturbance.

It does **not** replace or reinterpret the legacy `estimateCameraShakeBlur()` API.

### Disturbance trajectory

`parseStabilizationDisturbanceTrajectory()` describes camera rotational displacement over the same capture-reference clock used by #12:

`first-opening-boundary-phase`

The first schema requires:

- a zero-displacement sample at `t = 0`;
- strictly increasing sample times;
- explicit pitch/yaw/roll displacement in radians;
- no embedded subject motion;
- no embedded camera translation;
- no embedded support/tripod state.

This preserves the architecture:

```text
physical disturbance -> stabilization response -> residual rotation -> exposure-time image formation
```

Stable support remains simply an explicit zero disturbance trajectory. It does not automatically switch stabilization on or off.

### Generic physical architectures

`parseStabilizationSystemProfile()` supports generic synthetic:

- `off`;
- `sensor-shift`;
- `lens-optical`;
- `coordinated-physical`.

Schema 0.1.0 deliberately does not claim branded camera/lens behavior.

Each corrected axis can declare:

- correction gain from 0 through 1;
- response latency in seconds;
- maximum image-equivalent angular correction in radians.

The first dynamic response is:

```text
requested correction(t)
  = gain × disturbance(t - latency)

applied correction
  = symmetric clamp(requested correction, angular limit)

residual
  = current disturbance(t) - applied correction
```

Before the latency interval has elapsed, the delayed measurement is zero.

This is an explicit generic approximation. It is not a CIPA stop-rating conversion, control-loop identification, or commercial IBIS/OIS calibration.

### Coordinated body + lens behavior

A `coordinated-physical` profile includes explicit body/lens allocation fractions that sum to one.

Those fractions describe ownership of **one total correction**. The engine does not apply body correction and lens correction independently and then add them again.

This prevents coordinated stabilization from double-counting correction.

### Panning

The model never infers pan intent.

A profile may explicitly use:

`declared-axis-bypass`

for one pitch/yaw/roll axis. Correction on that axis is then suppressed while the other declared axes continue to use the selected response.

### Correction limits

Angular travel/range limits are explicit.

If requested correction exceeds an axis limit, the applied correction is clamped and the result reports `correctionLimitReached: true`.

The engine does not produce unlimited correction merely because a profile has high gain.

### Capture-time sampling

`calculateStabilizedCaptureTemporalSamples()` evaluates stabilization at deterministic midpoint nodes inside each committed #12 local exposure window.

This is especially important for rolling/local exposure timing: two native sensor positions may evaluate the same disturbance/stabilizer at different capture times.

Sensor **data-readout timing is not used as exposure timing**.

The result reports disturbance, applied correction and residual rotation at each node. It does not itself calculate:

- image-plane mapping;
- radiance;
- blur kernels;
- PSF;
- final pixels.

Those remain downstream image-formation responsibilities.

### Explicit boundaries

The first time-domain model does not include:

- camera translation/parallax correction;
- sensor-shift position within the lens image circle;
- OIS lens-group ray-geometry changes;
- spontaneous stabilizer drift;
- settling/recentering transients beyond declared latency;
- inferred panning;
- support/tripod auto-detection;
- shutter shock or wind/floor vibration generation;
- digital/electronic stabilization.

Digital stabilization remains downstream geometric warp/crop/resampling work and must preserve any field-of-view/crop consequences rather than being represented as physical residual camera motion.

## Ideal stable support boundary

Photivra's current **ideal stable support** is an explicit zero-disturbance boundary condition, not a separate blur equation and not a claim that real tripods are vibration-free.

Represent the boundary by supplying:

```ts
angularVelocityRadPerSec: {
  yaw: 0,
  pitch: 0
}
```

With this explicit input:

- unstabilized shake displacement is exactly zero;
- stabilized shake displacement is also exactly zero for any `stabilizationStopsEquivalent`;
- focal length, shutter duration, finite-focus projection, infinity/pinhole projection, and pixel pitch do not create motion from a zero-motion input;
- subject motion remains independent;
- physical orientation/output transforms preserve the zero vector.

Do **not** represent stable support by an arbitrarily large stabilization-stop value. Stabilization attenuates supplied camera motion; it is not the source of the stable-support state.

This boundary also does not silently remove disturbances that are not currently modeled, including shutter shock, release-button impulse, wind, floor/ground vibration, support flex/resonance, or future tripod dynamics. Those effects must enter through their own explicit motion/support models.

Omitting the camera-shake input is semantically different from explicitly supplying zero motion: omission means the effect/input was not supplied, while explicit zero motion states the modeled stable-support boundary.

Real-camera policies about whether IBIS/OIS should be enabled on a tripod are equipment/mode-specific and remain separate from this generic boundary.

## Equivalent stabilization stops

The model accepts `stabilizationStopsEquivalent`.

For educational exploration, the supplied angular displacement is attenuated by:

`residualMotionFactor = 2 ^ (-stops)`

For example, 3 equivalent stops produces a residual factor of 1/8 for the controlled synthetic shake profile.

This attenuation is an **approximation**. It is useful for demonstrating the effect of reducing camera motion, but it is not a model of a particular IBIS/OIS implementation and does not imply that a real stabilization system deterministically reduces every motion path by that factor.

Because the returned result combines this attenuation assumption with the geometric projection, the calculation envelope uses `provenance.kind = "approximation"`.

## CIPA reference

CIPA publishes **DC-011-2024** for measurement and description of image-stabilization performance.

Photivra is not affiliated with, sponsored by, endorsed by, certified by, or claimed to comply with CIPA. The current educational approximation does not implement the CIPA test method.

Reference:

- CIPA DC-011-2024 overview: https://www.cipa.jp/e/std/image-stabilization.html

Only the public standard identifier and high-level terminology are referenced here; CIPA logos and protected standard content are not incorporated into this project.

## Not yet modeled

The legacy stabilization-equivalent model intentionally remains limited to its original teaching contract. The separate #97 system adds rotational roll-capable time-domain correction, latency, axis limits, explicit panning-axis bypass, coordination, and #12 local-exposure sampling without changing legacy results.

Still outside the current stabilization foundations are translational camera-shake correction, frequency-domain control-loop calibration, photographer-specific empirical motion, shutter-button impulse generation, realistic tripod/support mechanics, focal-length-dependent real-equipment calibration, mechanism-specific IBIS/OIS ray geometry, automatic pan detection, and digital-stabilization crop/warp behavior.

Those capabilities should remain separate, documented models rather than being silently folded into either stabilization API.
