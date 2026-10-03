# Sensor support to environment radiance query

Release context: **package 1.2.0 candidate / root API 1.2.0**. Subsystem/model versions and dated introduction or measurement records below are independent historical identities; they are not distribution versions. See [developer navigation](DEVELOPERS.md) and [release contract](RELEASE_1_2_0.md).

`calculateSensorEnvironmentRadianceQuery()` derives a renderer-neutral environment
radiance request from an explicitly supplied physical sensor support point. It
reuses the existing focus-aware ideal projection and analytic inverse camera
rotation. This is a bounded environment-query adapter, not a surface-intersection
solver or a scene renderer.

## Coordinates, direction and clock

`sourcePointNativeSensorMm` is an optical support point in native sensor axes:
optical-axis origin, +X right, +Y down, millimetres. It can be a pre-AA quadrature
point or a pre-PSF source tap. The adapter converts it to image-plane axes with
`{x: native.x, y: -native.y}`. It never recentres off-axis support, applies digital
crop/orientation, or clips a source point to the sensor's active bounds.

Inputs retain physical `focalLengthMm`, an explicit finite/infinity `focus`, and
constant `angularVelocityRadPerSec` in the existing right-hand pitch/yaw/roll axes.
The existing `calculateInverseCameraRotationImageMapping()` owns the thin-lens
projection distance and simultaneous axis-angle rotation. Infinity uses physical
focal length; finite focus uses the existing Gaussian image distance. No alternate
projection or camera-motion equation is introduced.

`timeReference` must explicitly be `first-opening-boundary-phase`, mapping that
capture boundary to the rotation model's t=0. `timeSecondsFromOpeningReference`
is reused exactly for the query timestamp and rotation evaluation. Readout or
renderer time cannot stand in for that declared clock. Call separately at each
actual local shutter midpoint; this API does not establish local exposure timing.

The reference ray is normalized in camera axes at the first opening boundary,
with +Z forward. `referenceLookDirectionUnitVector` points **from camera toward
the environment**. The request's `outgoingDirectionUnitVector` is its negative,
representing radiance propagation **from environment toward camera**. This
adapter requires the explicit `outgoing-radiance-toward-camera` convention.
The selected provider must share it; providers indexing maps by a look direction
must deliberately convert the sign. Existing manually declared request semantics
are not rewritten by this additive API.

The existing rotation inverse rejects rays at or behind the exposure-start
reference camera plane. This forward-hemisphere limit is preserved, rather than
silently extending the primitive to arbitrary 360-degree environment queries.

## Request identity and handoff

`request` supplies the existing scene/provider/illumination/material IDs, unique
sample ID, schema version, wavelength and explicit air/vacuum basis. The adapter
owns its environment target and timestamp, then parses the complete request
through `parseSceneRadianceEvaluationRequest()`.

Use the returned request with the provider responsible for scene radiance. Bind
its result through the existing scene-profile/request/result validator and optical
bridge. At sensor quadrature nodes, the generated request can replace a manually
declared environment target in `calculateSceneToSensorIrradianceQuadrature()`.
At PSF support points, evaluate radiance/optical irradiance separately at each
point before supplying the local sampled-PSF adapter. Do not copy one environment
scalar across directions without an explicitly uniform provider model.

`geometricRayProjectionCalculated` is true for this named ideal model only.
`sceneIntersectionCalculated`, `visibilityCalculated` and `providerExecuted`
remain false. Existing scene/optical diagnostic origin flags remain conservative:
calling this adapter does not rewrite them or provide measured source truth.

## Limits and verification

Environment/rotation reference axes are explicitly the camera axes at the first
opening boundary. There is no world-pose translation or implicit Euler pose.
Surface points/material visibility, translation/parallax, moving objects, lens
distortion, chromatic field mapping, focus breathing, radiance transport and
production activation remain separate. The adapter's approximation envelope
retains the child analytic projection result; it claims no real-lens calibration,
combined uncertainty or full photographic accuracy.

Tests independently predict native/optical signs, direction normalization,
finite-focus projection and axis-specific Rodrigues rotation. Forward/inverse
rotation round trips preserve captured points. Actual pre-AA node requests pass
the existing provider-binding/optical adapter with owned synthetic radiance.
Unknown clock/direction/focus/basis, negative time, nonfinite point, invalid focal
length and behind-reference-plane requests reject. Inputs/results are owned
without mutating caller state.

Root API **0.112.0 → 0.113.0**, model 0.1.0. Existing public contracts and other
version surfaces stay unchanged; historical capture/file replay retains its API
stamp. No dependency, external asset, network access or cost is introduced.
At this introduction checkpoint, #16/#178/#112 were open and V1 was 25/32. They are now reviewed/merged; final conformance is complete.
