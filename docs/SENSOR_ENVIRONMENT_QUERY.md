# Sensor support to environment radiance query

> **Release context.** This page was written for package 1.2.0 (root API 1.2.0) and has not been re-reviewed for later releases. The [changelog](../CHANGELOG.md) describes the current release. Model and subsystem version numbers on this page, and any dated records, are separate from the package version. See also the [developer guide](DEVELOPERS.md) and the [1.2.0 release contract](RELEASE_1_2_0.md).

`calculateSensorEnvironmentRadianceQuery()` answers: "for this point on the sensor, at this moment, which direction in the environment does the light come from?" It builds a radiance request that does not depend on any renderer.

- Input: an explicitly supplied physical support point on the sensor.
- It reuses the existing focus-aware ideal projection and the analytic inverse camera rotation.
- It is a bounded adapter for environment queries. It is not a surface-intersection solver or a scene renderer.

## Coordinates, direction and clock

**The sensor point.** `sourcePointNativeSensorMm` is an optical support point in native sensor axes: origin on the optical axis, +X right, +Y down, in millimetres.

- It can be a quadrature point before anti-aliasing, or a source tap before the PSF.
- The adapter converts it to image-plane axes as `{x: native.x, y: -native.y}`.
- It never recentres off-axis support, never applies digital crop or orientation, and never clips a point to the sensor's active area.

**Optics and motion inputs.**

- physical `focalLengthMm`;
- an explicit `focus`, finite or infinity;
- a constant `angularVelocityRadPerSec`, in the existing right-hand pitch/yaw/roll axes.

The existing `calculateInverseCameraRotationImageMapping()` owns the thin-lens projection distance and the simultaneous axis-angle rotation. Infinity focus uses the physical focal length; finite focus uses the existing Gaussian image distance. No other projection or camera-motion equation is introduced.

**Clock.**

- `timeReference` must be explicitly `first-opening-boundary-phase`. That capture edge is the rotation model's t=0.
- `timeSecondsFromOpeningReference` is used exactly, both for the query timestamp and for the rotation.
- Readout time or renderer time cannot replace this declared clock.
- Call the function separately at each actual local shutter midpoint. This API does not work out local exposure timing.

**Direction sign convention.** The reference ray is normalised in the camera axes at the first opening edge, with +Z forward.

- `referenceLookDirectionUnitVector` points **from the camera toward the environment**.
- The request's `outgoingDirectionUnitVector` is its negative: it is the direction the radiance travels, **from the environment toward the camera**.
- This adapter requires the explicit `outgoing-radiance-toward-camera` convention, and the chosen provider must use it too.
- A provider that indexes maps by look direction must flip the sign deliberately.
- Existing manually declared requests keep their meaning; this API does not rewrite them.

**Forward hemisphere only.** The existing rotation inverse rejects rays on or behind the camera's reference plane at the start of exposure. This limit is kept. The primitive is not quietly extended to arbitrary 360-degree environment queries.

## Request identity and handoff

**Building the request.** `request` supplies the existing scene, provider, illumination and material IDs, a unique sample ID, the schema version, the wavelength, and an explicit air or vacuum basis. The adapter fills in its own environment target and timestamp, then parses the complete request with `parseSceneRadianceEvaluationRequest()`.

**Using the request.**

1. Send it to the provider responsible for scene radiance.
2. Bind the result through the existing validator for scene profile, request and result, and through the optical bridge.

- At sensor quadrature nodes, the generated request can replace a manually declared environment target in `calculateSceneToSensorIrradianceQuadrature()`.
- At PSF support points, evaluate radiance and optical irradiance separately at each point, before passing them to the local sampled-PSF adapter.
- Do not copy one environment value across different directions, unless the provider model is explicitly uniform.

**Flags.**

- `geometricRayProjectionCalculated` is true, for this named ideal model only.
- `sceneIntersectionCalculated`, `visibilityCalculated` and `providerExecuted` stay false.
- Existing diagnostic origin flags for scene and optics stay conservative. Calling this adapter does not change them, and does not supply measured source truth.

## Limits and verification

**Reference axes.** The environment and rotation reference axes are the camera axes at the first opening edge. There is no world pose translation, and no implicit Euler pose.

**Out of scope:** surface points and material visibility, translation and parallax, moving objects, lens distortion, chromatic field mapping, focus breathing, radiance transport and production activation.

The adapter's approximation record keeps the child analytic projection result. It claims no real-lens calibration, combined uncertainty or full photographic accuracy.

**Tests** independently check:

- native and optical signs;
- direction normalisation;
- finite-focus projection;
- per-axis Rodrigues rotation;
- that forward/inverse rotation round trips return the captured points;
- that real requests at pre-anti-aliasing nodes pass the existing provider-binding and optical adapter, using owned synthetic radiance;
- rejection of an unknown clock, direction, focus or basis, negative time, a non-finite point, an invalid focal length, and requests behind the reference plane;
- that inputs and results are owned, and caller state is not changed.

**Versions.** Root API **0.112.0 → 0.113.0**, model 0.1.0. Existing public contracts and other version numbers did not change; replay of historical captures and files keeps its API stamp. No dependency, external asset, network access or cost is introduced.
