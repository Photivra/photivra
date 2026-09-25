# Local POC Simulation API

Photivra includes a minimal Node HTTP transport for proof-of-concept development and integration testing.

It is **not** the recommended production runtime. Browser applications can consume the root `@photivra/engine` scientific surface directly; the production Photivra architecture is intended to keep the simulation math client-side rather than expose this unauthenticated POC server to the public internet.

## Repository and package boundary

`@photivra/engine` publishes only the runtime-neutral scientific/calculation surface.

The Node HTTP transport remains in this GitHub repository under `src/api` as contributor/development tooling. It is **not** exported by the package and `dist/api` is explicitly excluded from the npm tarball.

The HTTP layer adds request parsing, CORS response headers, routing, and serialization. It does not add camera-science equations.

## Build and run from a repository checkout

```sh
npm ci
npm run build
node dist/api/poc-api-cli.js
```

This command is a repository-development workflow. Installing `@photivra/engine` from npm does not install or expose the POC HTTP server.

Defaults:

- bind host: `localhost` (loopback only);
- API URL: `http://localhost:8787`;
- CORS allowed origin value: `http://localhost:5173`.

Overrides:

- `PHOTIVRA_API_HOST`;
- `PHOTIVRA_API_PORT`;
- `PHOTIVRA_ALLOWED_ORIGIN`.

The server is unauthenticated and therefore binds only to loopback by default. Setting `PHOTIVRA_API_HOST` to a non-loopback address exposes it beyond the local machine and is outside the security model supplied by this repository.

CORS is a browser policy, **not** authentication or authorization. Non-browser clients can call an exposed endpoint regardless of its CORS header.

The server accepts request bodies up to 64 KiB. It does not provide production rate limiting, authentication, quotas, reverse-proxy hardening, or abuse controls.

## Health

`GET /health`

Example:

```json
{
  "ok": true,
  "service": "photivra-engine",
  "apiVersion": "0.18.0"
}
```

## Simulate

`POST /v1/poc/simulate`

Requests must use `Content-Type: application/json`.

All physical quantities use explicit units in their property names.

The POC transport reports the composed simulation contract version, not the root library `ENGINE_API_VERSION`. The current composed contract is exposed as `POC_SIMULATION_API_VERSION`.

POC simulation API 0.18 composes projection using the selected focus plane. The response includes a `projection` block with ideal thin-lens image distance, scale relative to the infinity-focus approximation, and model provenance. Full-sensor field of view, crop field of view, object sampling, subject motion, and camera-shake projection use that same selected projection plane.

### Post-0.2 standalone foundations

The root engine contains newer standalone sensor/capture APIs that are deliberately **not** part of this POC request contract yet.

POC simulation API 0.18 does not accept:

- physical `CaptureOrientation`;
- arbitrary native `activeCaptureRect`;
- native↔oriented coordinate transforms as request state;
- sensor-architecture metadata;
- radiometry-readiness profiles.

It also does not use 35 mm-equivalent focal length as an optical input; physical focal length remains authoritative.

The POC continues to use its compatibility same-aspect crop-factor model. Integrating the newer capture geometry or radiometry foundations requires an explicit POC simulation contract/version change rather than silently changing the meaning of existing fields.

### Required request groups

The request includes:

- sensor dimensions and resolution;
- focal length and aperture;
- shutter duration and ISO;
- focus distance;
- exactly one circle-of-confusion criterion:
  - explicit target `circleOfConfusionMm`, or
  - an equivalent-viewing reference sensor/CoC convention;
- crop factor;
- diffraction wavelength;
- one representative object position and velocity.

### Optional request groups

The request may also include:

- physical subject dimensions/distance for pixels-on-subject calculation;
- named scene-plane distances for defocus sampling;
- named physical objects for projected pixel sampling;
- named object motion samples with explicit position/velocity vectors;
- target subject-height fraction for framing crop;
- controlled yaw/pitch camera-shake profile plus equivalent stabilization-stop attenuation;
- ideal regular-polygon aperture blade count/orientation;
- primary-subject diagnostics selecting a named motion sample.

Named sample IDs must be non-empty and unique within their respective arrays.

## Response semantics

### Projection and field of view

The top-level `fieldOfView` always describes the full sensor before digital cropping.

`projection` reports:

- selected focus distance;
- ideal Gaussian thin-lens image distance;
- scale relative to the infinity-focus `f` projection;
- calculated model provenance.

This remains ideal paraxial geometry, not a real-lens focus-breathing calibration.

### Crop

`crop` reports the requested fixed crop factor, retained pixel dimensions/area, megapixels, and its effective field of view.

If `subjectCrop` is requested, subject framing is composed **after** the fixed crop. The response distinguishes:

- `additionalCropFactor`: framing crop relative to the fixed crop;
- `totalCropFactor`: total linear crop relative to the full sensor.

`subjectHeightFraction` is not clamped to 1. A value above 1 with `subjectClipped: true` means the projected subject is taller than the output frame.

The framing calculation assumes the crop can be positioned around the subject; it does not validate subject position against source-image edges.

### Sensor sampling

The response exposes horizontal and vertical geometric sampling pitch plus their relative difference. The composed POC still uses the backwards-compatible horizontal pitch as its representative scalar for blur/sampling calculations and therefore rejects sensor geometry whose X/Y pitch differs by more than 1%. This prevents silent directional error until the composed POC becomes fully axis-aware.

### Subject/object sampling


When physical subject/object dimensions are supplied, projected dimensions are returned in sensor millimetres and pixels using the focus-aware projection plane.

These values can drive pre-authored asset/detail selection without moving projection math into a renderer.

### Defocus

Named defocus samples return ideal geometric blur-circle diameters in sensor millimetres and pixels.

### Subject motion

Primary and named motion samples return representative-point sensor-plane displacement in millimetres and pixels, including signed x/y components.

The model assumes constant world-space linear velocity. It can represent depth-direction motion of the representative point but does not model extended-object scale blur, rotation, acceleration, deformation, or occlusion changes.

### Camera shake

When supplied, camera shake returns unstabilized and stabilized global image-plane vectors.

Yaw/pitch projection uses the selected focus-aware projection distance. Equivalent stabilization stops attenuate angular displacement by `2^-stops` and are explicitly labeled an approximation.

The result is not a CIPA DC-011 measurement, real-camera stabilization rating, or spatially varying rotational optical-flow model.

### Aperture and diffraction

The optional aperture-shape response contains regular-polygon vertices plus idealized sunstar direction symmetry. Blade count is bounded to 1024.

The separate diffraction result remains the ideal **circular-pupil** first-zero Airy diagnostic and reports `pupilModel: "ideal-circular"`.

Polygon aperture geometry does not convert the circular Airy result into a polygon-aperture diffraction PSF.

### Focus criterion

For cross-format comparisons, the equivalent-viewing helper scales a caller-supplied reference CoC by sensor-diagonal ratio.

That is explicitly an approximation based on equivalent final viewing assumptions; it is not a physical lens/sensor blur threshold.

### Primary-subject diagnostics

When requested with the needed subject inputs, diagnostics report sampling, defocus, circular-pupil diffraction, optional named subject-motion path, and optional stabilized camera-shake path side by side.

They are intentionally **not** collapsed into one sharpness score because these quantities describe different physical effects.

### Provenance

Aggregate response provenance is:

- `calculated` when all included components are calculated models;
- `mixed` when an equivalent-viewing focus criterion and/or camera-shake approximation is present.

Component provenance identifies which parts are calculated versus approximate.

## Validation and errors

Decoded HTTP JSON is structurally checked for required object/array/string/finite-number/vector shapes before simulation.

That parser does not duplicate every scientific domain/range rule. Scientific modules remain responsible for constraints such as positive dimensions, physically valid distances, blade-count bounds, and crop limits.

Current transport responses include:

- `200`: successful simulation;
- `204`: CORS preflight;
- `400`: malformed JSON/shape or invalid scientific request;
- `404`: unknown route;
- `415`: simulation POST without `application/json`.

Error messages are intended for local development diagnostics and should not be treated as a hardened public error contract.

## Reusable repository module

Within this repository, `src/api/server.ts` exports an unbound `createPocApiServer` constructor for tests and trusted development composition.

It is repository-internal development tooling rather than a supported npm subpath. Importing the module in repository tests does not start a listener; the CLI entrypoint is responsible for binding the configured host/port.

## Important limitations

- Local POC transport only.
- No authentication or authorization.
- No rate limiting or public-service abuse protection.
- No persistence.
- No scene uploads.
- No calibration database.
- No real-camera/lens claims.
- ISO is an exposure/gain setting, not a noise shortcut.
- Photon/noise primitives exist in the root library, but calibrated photon/noise output is intentionally absent from the composed POC until the radiometric/spectral/optical/sensor prerequisites are defensible.
