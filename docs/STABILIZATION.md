# Camera Shake and Stabilization

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

The spatial primitive does not apply stabilization stops. Real IBIS/OIS behavior and translation/parallax remain separate future models.

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

The legacy stabilization-equivalent model intentionally omits:

- roll;
- translational camera shake;
- spatially varying rotational optical flow inside this compatibility API;
- frequency-dependent shake spectra;
- photographer-to-photographer variation;
- shutter-button impulse;
- tripod/support interactions;
- sensor/lens stabilization axis limits;
- IBIS/OIS coordination;
- focal-length-dependent stabilization effectiveness beyond projection geometry;
- rolling shutter;
- panning detection/modes.

Those capabilities should be added as separate, documented models rather than being silently folded into the current approximation.
