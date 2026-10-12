# Photivra engine agent rules: Motion and timing

These rules moved verbatim from [the domain rules index](AGENT_DOMAIN_RULES.md) and **remain binding** for temporal production composition and camera-rotation motion changes and their tests, reviews, documentation and APIs. The index's scientific-integrity rules apply to every domain; for cross-domain work, also read every other affected domain file. This file is not a substitute for the canonical API, scientific, provenance or numerical specifications.

## Production temporal-composition boundary

- Temporal capture input is immutable capture state, not renderer state. Preserve native raster, exposure boundaries, shutter mechanism, readout declaration, orientation, imaging area, rotation model and committed temporal sample count.
- The committed shutter duration and temporal-capture nominal exposure duration must match exactly enough for the shared setting tolerance; do not let temporal timing drift from resolved exposure control.
- Sensor data-readout timing and exposure-window timing remain separate contracts. The production plan must report synchronization as not assumed unless an explicit linkage model establishes it.
- Pure-camera-rotation temporal sampling delegates to the existing deterministic midpoint quadrature. Do not create a second motion equation or silently reduce the committed sample count for preview performance.
- A zero angular-velocity model is `modeled-zero`, not omitted. Global/no-spatial-skew readout requested through rolling-readout semantics is likewise modeled-zero.
- Renderer temporal-sampling limits are capability gates. Insufficient capacity blocks the renderer path but does not mutate the committed scientific quadrature.
- The authoritative image-formation graph still applies. Computing mature temporal timing results does not authorize bypassing an uncomposed PSF dependency.
- Production-plan consumer manifests may label an execution role `interactive-optimized` or `reference`, but both consume the same finalized scientific plan. Consumer role cannot reorder stages, change seeds, alter physical results, or reduce committed temporal samples.

## Spatial camera-rotation boundary

`calculateCameraRotationImageMapping()` is the engine-owned low-level model for pure rotational field flow.

- It uses physical camera rotation signs (right-hand pitch/yaw/roll about +X/+Y/+Z at exposure start).
- It returns image-plane +Y-up displacement; do not treat optional sample displacement as native-raster +Y-down without an explicit transform.
- It is time-parameterized in seconds from exposure start.
- It integrates simultaneous angular velocity as one axis-angle vector rather than ordered Euler steps.
- Do not add translation to this depth-independent primitive; translation/parallax requires scene depth.
- Do not silently replace `estimateCameraShakeBlur()`; that older function keeps its legacy global-vector/stabilization approximation and sign semantics.
- Do not add stabilization stops to the pure rotation primitive without a separate documented control/stabilization model.
- Rolling readout must consume the same time-parameterized rotation semantics rather than defining another camera-motion equation.
- Capture rotation trajectories may bind the exposure-window `first-opening-boundary-phase` to the existing rotation model's t=0 only inside an explicit integration layer; do not silently redefine the low-level time origin.
- Do not call forward local-exposure trajectory endpoints a rolling-shutter warp or blur kernel. Renderer-ready rolling-shutter geometry must solve capture-location-dependent timing consistently and exposure blur requires integration over the local interval.
- Sensor data-readout timing must not enter capture-motion geometry unless a separate explicit capture-mode/link contract establishes that relationship.
- For the current constant-axis pure-rotation model, prefer the analytic inverse mapping over an iterative/fixed-point solver; do not introduce numerical convergence machinery when the inverse is closed-form.
- Any instantaneous capture-scan mapping must require an explicit local-exposure phase. Never silently choose midpoint/start/end and present it as the finite-exposure result.
- Finite-exposure temporal geometry must preserve separate dimensionless time-average weights and seconds-valued integration measures; do not conflate either with shutter transmission, radiometric throughput, photon count, or sensor response.
- The first finite-exposure rotation model uses deterministic uniform midpoint quadrature and must reuse the existing instantaneous inverse mapping rather than copy camera-motion equations.
- Do not average geometric coordinates and call the result motion blur. Blur/radiance accumulation belongs to downstream scene sampling and must account for visibility/radiance over time.
- Do not invent a geometry-only quadrature error bound; convergence evidence must be measured in the downstream quantity being integrated.
- Do not clamp reference rays that leave the active source frame under motion; expose the geometry and let renderer/source-coverage policy handle missing samples.
