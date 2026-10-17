# Local POC Simulation API

> **Release context.** This page was written for package 1.2.0 (root API 1.2.0) and has not been re-reviewed for later releases. The [changelog](../CHANGELOG.md) describes the current release. Model and subsystem version numbers on this page, and any dated records, are separate from the package version. See also the [developer guide](DEVELOPERS.md) and the [1.2.0 release contract](RELEASE_1_2_0.md).

Photivra includes a minimal Node HTTP server for proof-of-concept (POC) development and integration testing.

It is **not** the recommended production runtime. Browser applications can call the root `@photivra/engine` functions directly. The production Photivra design keeps the simulation maths in the client, rather than exposing this unauthenticated POC server to the public internet.

## Repository and package boundary

`@photivra/engine` publishes only the scientific and calculation functions, which run in any JavaScript runtime.

The Node HTTP server stays in this GitHub repository, under `src/api`, as tooling for contributors and development. The package does **not** export it, and `dist/api` is explicitly left out of the npm tarball.

The HTTP layer adds request parsing, CORS response headers, routing and serialisation. It adds no camera-science equations.

## Build and run from a repository checkout

```sh
npm ci
npm run build
node dist/api/poc-api-cli.js
```

This works only from a repository checkout. Installing `@photivra/engine` from npm does not install or expose the POC HTTP server.

Defaults:

- bind host: `localhost` (loopback only);
- API URL: `http://localhost:8787`;
- CORS allowed origin value: `http://localhost:5173`.

Overrides:

- `PHOTIVRA_API_HOST`;
- `PHOTIVRA_API_PORT`;
- `PHOTIVRA_ALLOWED_ORIGIN`.

The server has no authentication, so by default it listens only on loopback (this machine). Setting `PHOTIVRA_API_HOST` to a non-loopback address exposes it to other machines. That is outside the security model this repository provides.

CORS is a browser policy, **not** authentication or authorisation. Non-browser clients can call an exposed endpoint whatever its CORS header says.

The server accepts request bodies up to 64 KiB. It has no production rate limiting, authentication, quotas, reverse-proxy hardening or abuse controls.

## Contract version 1.0.0

Package 2.0.0 sets `POC_SIMULATION_API_VERSION` to `1.0.0` (from `0.20.0`) because the response changed:

- exact thin-lens depth-of-field limits;
- a circle of confusion at or above the aperture diameter is rejected;
- the numerically stable closed-form defocus diameter;
- whole-pixel crop rounding (crop model 2.0.0);
- the physical right-hand sign convention for camera shake, with quarter-turn rejection;
- crop factor and sensor diagonal computed only from correctly rounded operations (see [numerical correctness](NUMERICAL_CORRECTNESS.md#cross-engine-determinism)).

Request fields are unchanged. The transport adds the magnitude limits and the 422 status described below.

## Health

`GET /health`

Example:

```json
{
  "ok": true,
  "service": "photivra-engine",
  "apiVersion": "1.0.0"
}
```

## Simulate

`POST /v1/poc/simulate`

Requests must use `Content-Type: application/json`.

Every physical quantity has its unit in the property name.

The POC server reports the version of the composed simulation contract (`POC_SIMULATION_API_VERSION`), not the root library's `ENGINE_API_VERSION`.

Since POC simulation API 0.20, projection uses the selected focus plane. The response includes a `projection` block with the ideal thin-lens image distance, the scale relative to the infinity-focus approximation, and model provenance. Full-sensor field of view, crop field of view, object sampling, subject motion and camera-shake projection all use that same projection plane.

### Sensor/capture composition in POC API 0.20

POC simulation API 0.20 started using the standalone sensor/capture model, as an **addition** to the existing behaviour.

Existing requests are still valid. New callers can opt in to staged capture geometry with a `capture` object containing:

- physical `orientation`;
- optional native `activeCaptureRect`;
- optional oriented `outputCropRect`;
- optional final `outputRaster`.

The compatibility rules are deliberately strict:

- legacy `crop.factor` is still available for existing callers;
- when `capture` is supplied, legacy `crop.factor` must be `1`, so two crop models are never silently stacked;
- without staged capture, the legacy top-level `subjectCrop` response means exactly what it did before;
- with staged capture, subject framing is reported under `capture.subjectFraming`, and is applied after the declared output crop and resampling;
- with staged capture, the equivalent-viewing CoC (circle of confusion) is based on the final physical image region kept for viewing, including subject framing if present. Output pixel count alone does not change it.

The response keeps the existing full-sensor and native-vector fields unchanged, and adds an optional `capture` block with:

- resolved native/active/oriented/output geometry, including final retained physical bounds;
- active-capture and final-output FOV, including asymmetric bounds for off-center capture/output crop;
- physical actual focal length plus active-capture diagonal-based 35 mm equivalence;
- explicit oriented-capture→output pixel scaling;
- optional capture-specific subject framing with final retained physical area and effective FOV;
- explicit native-raster, oriented-capture, and final-output motion-vector diagnostics;
- corresponding native-raster/oriented/output camera-shake vectors when camera shake is requested.

The final digital (output) crop does not change the physical focal length or the 35 mm equivalence of the active capture. The physical `lens.focalLengthMm` stays the optical input.

Sensor architecture metadata and radiometry-readiness profiles are still standalone, and are not yet used by the POC.

### Required request groups

The request includes:

- sensor physical imaging dimensions and native effective raster;
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

### Sensor and staged capture geometry

The `sensor` response includes the shared `SensorGeometryMetrics` result, as well as the backwards-compatible representative pitch fields. This gives the crop factor of the physical imaging area, exact native-raster megapixels, and separate X and Y geometric sample pitch. Sample pitch is not treated as photosite collection area.

When the opt-in `capture` request is present, the response also shows the staged geometry pipeline:

```text
native physical imaging area + native raster
                ↓
native active-capture rectangle
                ↓
physical camera orientation
                ↓
oriented active capture
                ↓
digital/output crop
                ↓
final output raster
```

Native sensor coordinates do not change with orientation. Active-capture FOV is computed from the physical area kept, including asymmetric angular bounds for an off-centre area.

Legacy projected-motion and camera-shake X/Y values use the existing image-plane axes (+X right, +Y up). Capture raster coordinates use +X right, +Y down. So the capture diagnostics show each step explicitly: conversion to `nativeRasterDeltaPixels`, rotation to `orientedCaptureDeltaPixels`, then scaling to `outputDeltaPixels`. Legacy fields are unchanged.

### Legacy crop

`crop` reports the requested legacy centered crop factor, retained pixel dimensions/area, megapixels, and its effective field of view.

If `subjectCrop` is requested, subject framing is composed **after** the fixed crop. The response distinguishes:

- `additionalCropFactor`: framing crop relative to the fixed crop;
- `totalCropFactor`: total linear crop relative to the full sensor.

`subjectHeightFraction` is not clamped to 1. A value above 1 with `subjectClipped: true` means the projected subject is taller than the output frame.

The framing calculation assumes the crop can be positioned around the subject; it does not validate subject position against source-image edges.

### Sensor sampling

The response shows horizontal and vertical geometric sampling pitch, and their relative difference. The composed POC still uses the backwards-compatible horizontal pitch as its single representative value for blur and sampling calculations. So it rejects sensor geometry whose X and Y pitch differ by more than 1%. This prevents a hidden direction-dependent error until the composed POC handles each axis separately.

### Subject/object sampling

When physical subject or object dimensions are supplied, their projected sizes are returned in sensor millimetres and pixels, using the focus-aware projection plane.

A client can use these values to pick pre-made assets or levels of detail, without moving projection maths into a renderer.

### Defocus

Named defocus samples return ideal geometric blur-circle diameters in sensor millimetres and pixels.

### Subject motion

The primary and named motion samples return how far one representative point moves on the sensor plane, in millimetres and pixels, with signed x/y components.

The model assumes constant linear velocity in the world. It can represent the point moving toward or away from the camera. It does not model the scale blur of an extended object, rotation, acceleration, deformation or occlusion changes.

### Camera shake

When requested, camera shake returns global image-plane vectors without and with stabilisation.

Yaw and pitch are projected with the selected focus-aware projection distance. Positive yaw (camera turns left) gives positive `deltaXmm`. Positive pitch (camera tilts up) gives negative `deltaYmm`; this changed in engine 2.0.0, and earlier versions returned positive `deltaYmm`. Equivalent stabilisation stops reduce the angular displacement by `2^-stops`, and are explicitly labelled an approximation.

The result is not a CIPA DC-011 measurement, real-camera stabilization rating, or spatially varying rotational optical-flow model.

### Aperture and diffraction

The optional aperture-shape response contains regular-polygon vertices plus idealized sunstar direction symmetry. Blade count is bounded to 1024.

The separate diffraction result remains the ideal **circular-pupil** first-zero Airy diagnostic and reports `pupilModel: "ideal-circular"`.

Polygon aperture geometry does not convert the circular Airy result into a polygon-aperture diffraction PSF.

### Focus criterion

To compare formats, the equivalent-viewing helper scales a reference CoC from the caller by the diagonal of the physical image region that is assumed to be enlarged to the final viewing size.

Legacy requests still use the full physical sensor. In staged capture mode, the region is what remains after active capture and output crop, plus centred subject framing if requested. Changing only the encoded output raster does not change this criterion.

This is explicitly a viewing approximation, not a physical lens or sensor blur threshold. An explicit `circleOfConfusionMm` from the caller is never changed by crop or output geometry.

### Primary-subject diagnostics

When requested, with the subject inputs they need, diagnostics report these side by side: sampling, defocus, circular-pupil diffraction, an optional named subject-motion path, and an optional stabilised camera-shake path.

They are deliberately **not** combined into one sharpness score, because they describe different physical effects.

### Provenance

Aggregate response provenance is:

- `calculated` when all included components are calculated models;
- `mixed` when an equivalent-viewing focus criterion and/or camera-shake approximation is present.

Component provenance identifies which parts are calculated versus approximate.

## Validation and errors

Before simulating, the server checks the shape of the decoded JSON: required objects, arrays, strings, finite numbers and vectors.

That parser does not repeat every scientific range rule. The scientific modules still enforce constraints such as positive dimensions, physically valid distances, blade-count limits and crop limits.

The parser also limits the size of the two fields whose finite but extreme values would otherwise overflow inside the simulation:

- `lens.aperture` may not exceed 10000, or be a positive value below 0.01;
- `focus.focusDistanceM` may not exceed 1e9 m, or be a positive value below 1e-9 m.

Values outside these limits return 400. The limits are a request guard, not a scientific domain; the calculation modules still reject zero and negative values.

Current transport responses include:

- `200`: successful simulation;
- `204`: CORS preflight, with no response body;
- `400` (`INVALID_SIMULATION_REQUEST`): malformed JSON (fixed message), request shape, or invalid configuration/scientific input;
- `404`: unknown route;
- `413` (`PAYLOAD_TOO_LARGE`): request body over 64 KiB, by declared `Content-Length` or while streaming;
- `415`: simulation POST without `application/json`;
- `422` (`SIMULATION_RESULT_OUT_OF_RANGE`): a structurally valid request whose finite values drive a result outside the finite numeric range (`InvalidScientificResultError`); the engine-authored message is returned;
- `500` (`INTERNAL_ERROR`): any other failure, with the fixed message `Internal simulation error.`; internal error text is never returned.

400 messages are validation diagnostics written by the engine for local development. Do not treat them as a hardened public error contract.

## Reusable repository module

In this repository, `src/api/server.ts` exports `createPocApiServer`, a constructor that does not start listening. It is for tests and trusted development setups.

It is internal development tooling, not a supported npm subpath. Importing the module in tests does not open a port; the CLI entry point binds the configured host and port.

## Important limitations

- Local POC transport only.
- No authentication or authorization.
- No rate limiting or public-service abuse protection.
- No persistence.
- No scene uploads.
- No calibration database.
- No real-camera/lens claims.
- ISO is an exposure/gain setting, not a noise shortcut.
- Photon and noise primitives exist in the root library, but the composed POC deliberately produces no calibrated photon or noise output. That will stay so until the radiometric, spectral, optical and sensor prerequisites are defensible.
