# Authoritative simulated capture

> **Release context.** This page was written for package 1.2.0 (root API 1.2.0) and has not been re-reviewed for later releases. The [changelog](../CHANGELOG.md) describes the current release. Model and subsystem version numbers on this page, and any dated records, are separate from the package version. See also the [developer guide](DEVELOPERS.md) and the [1.2.0 release contract](RELEASE_1_2_0.md).

A `SimulatedCapture` is the record of one simulated shot (issues #15A/#15B). It commits a floating-point master image manifest, in no particular file format, **before** any tone mapping or conversion to LDR (low dynamic range).

The container itself does not create or convert pixels:

- the separate [colour API](CAPTURE_COLOR.md) converts supported planes;
- the [encoding API](LINEAR_CAPTURE_ENCODING.md) quantises them, without changing the master.

TIFF/DNG serialisation and turning on production stages are separate. The related capture, processed-output and export work (#15, #112, #16) is merged. Their explicit adapters own rendering and paired export; the container on its own does neither.

## Image state and storage

**Creating a capture.** `createSimulatedCapture()` validates, copies and deeply freezes its input. Its `calculated` provenance describes this structural commitment. The status and evidence identities of upstream models are kept separately, and are never upgraded to calibrated or radiometry-ready.

**Planes.** Each plane has its own ID and image-state ID, an exact raster binding, and co-sited, tightly interleaved channels. Rows start at the top left, with +X right and +Y down. A CFA mosaic is never inferred just because there are several channels.

| State | Required meaning |
| --- | --- |
| scene-referred-xyz | X,Y,Z order; explicit cie-1931-2-degree-xyz profile 1.0.0 and normalized encoding white |
| virtual-sensor-channels | Declared channels/source profile; colorimetric transform/encoding white unresolved |
| color-transformed-linear-rgb | red,green,blue order; encoding profile/white and explicit linear-color transform history |

**Sample values.**

- Samples are relative linear values, normalised by `referenceWhiteValue`. They are not absolute radiance, photons, electrons or measured commercial-camera RGB.
- Finite negative values and headroom above white are kept unchanged.
- NaN, Infinity and sparse arrays fail.
- Inline signed zero becomes ordinary zero for serialisation.

**Inline versus external storage.**

- Inline planes are JavaScript number arrays (Float64 values), with a total budget of one million samples.
- Large images use `external-float32` or `external-float64` references: IEEE 754 little-endian values with no header or padding, tightly interleaved in row and channel order, with the complete plane's sample count, an opaque public artifact ID, and a lowercase SHA-256 over the exact bytes.
- No path, URL or runtime IO is involved. The engine does not read or verify external bytes, finite values, the digest or source quality. A future loader must do that before using the samples.
- The declared storage precision says nothing about the precision of the renderer.

**Colour identity.**

- The XYZ observer identity documents meaning, without spectral integration or copied colour tables.
- RGB profile references are kept, but are not turned into a transform here. A serialiser cannot infer colour coefficients from a profile name.
- `resolveSimulatedCapturePlane()` requires the exact requested image state.

## Geometry and deterministic commitment

**Geometry.** The capture reuses `ResolveCaptureGeometryInput`, so it keeps native, active, oriented and output geometry, off-centre regions and all four orientations.

- Planes must match the dimensions of the oriented active capture or of the output.
- Exposure and focal metadata, and finite or infinity focus, stay explicit.
- The existing diagonal equivalent-focal-length calculator uses the active physical capture area; an output crop never changes it.

**Time and noise.** Scene time is in seconds on the producer's scene clock. The capture keeps a fixed uint32 noise seed, the noise realisation and model identity, source checksums, public profile and evidence IDs, and the engine API version. A seed alone does not prove the pixels can be reproduced; the container does not rerun a renderer or noise generator.

**Parsing and serialising.**

- `parseSimulatedCapture()` recomputes and checks the derived geometry and focal equivalence, and keeps the historical creator API identity.
- `serializeSimulatedCapture()` writes normalised JSON with only allowed fields. The output does not depend on the order of object properties in the input; list order still matters.
- This is a manifest. It is not TIFF/DNG, and not a new cryptographic hash of meaning.

## WB, whites and saturation

**White-balance (WB) intent.** `createCaptureWhiteBalanceIntent()` takes a resolved WB state, and copies its public state and profile identity, source, lock and gains. Measurement, debug and free-text extras are dropped. It adds no AWB estimator and no oracle for the "true" illumination:

```ts
import { resolveManualWhiteBalance, createCaptureWhiteBalanceIntent } from "@photivra/engine";
const state = resolveManualWhiteBalance({
  stateId: "wb-1", channelGains: { red: 2, green: 1, blue: 0.5 }
});
const intent = createCaptureWhiteBalanceIntent({ state });
```

**Intent versus application.** Recording an intent is separate from applying it to a plane. A plane's WB status is one of: intent-only, applied-rgb-gains, applied-chromatic-adaptation or not-applicable.

- Applied gains need compatible RGB channels and a resolved intent.
- Applied adaptation needs an adopted white, transformed RGB and explicit adaptation history, independently of any RGB intent.
- Recording a status does not verify that upstream really applied it; the separate [colour API](CAPTURE_COLOR.md) does the actual conversion.
- Camera RGB gains cannot be declared as applied to XYZ.

**Two kinds of white.** The adopted white and the encoding white are separate normalised XYZ records (Y=1, positive X and Z). A null adopted white means unresolved; it does not silently mean D65 or the encoding white. No single physically unique white is claimed under mixed lighting.

**Dynamic range and saturation.**

- Source dynamic-range history is one of: unknown, no-loss-declared or upstream-clipped. Float64 storage cannot recover earlier clipping.
- Capture saturation is, separately, either unmodelled, or a declared virtual white level or count of samples clipped upstream.
- Reference white, capture saturation, future integer limits, rendering exposure and display white are all separate.
- This API never clamps samples, and never infers clipped counts from values equal to white.

## Public metadata and limits

**Strict fields.** Unknown fields fail at every boundary: capture, source, geometry, exposure, model, plane, transform, storage and WB manifest.

**ID syntax.** Public opaque IDs and versions may use ASCII letters and digits plus dot, underscore, colon and hyphen, up to 128 characters. Paths, URLs containing slashes, and email addresses fail. There is no support for private paths, prompts, internal URLs, proprietary manifests, names or emails, precise locations or hidden debug fields.

Producers must choose IDs that are genuinely public and non-personal. Syntax rules cannot prove that an otherwise valid ID is not sensitive. Reviewing the public-ID registry and provenance is the producer's job. There is no free-text metadata bag.

## Versioning and evidence

**Schema.** The schema is 0.2.0.

- Legacy 0.1.0 archives are normalised to 0.2.0, keeping the creator API identity.
- The new applied-chromatic-adaptation state cannot be declared in a 0.1.0 archive.
- Re-serialisation writes the current schema, so archive bytes change on migration.

When introduced, root API on main moved from 0.95.0 to 0.96.0. Package, POC and production contracts did not change.

**Tests** reuse the canonical shared fixture (issue #130) for geometry, settings and seed. They cover:

- unclamped data;
- immutable, canonical archive round trips;
- all four orientations and off-centre capture;
- active and output focal equivalence;
- cleaning, intent and application of WB;
- substituting the wrong image state;
- RGB history;
- large external planes;
- keeping saturation concepts separate;
- private or malformed metadata;
- infinity focus;
- historical identity.

**Sources.** The implementation and tests were written independently. No third-party code, calibration data, colour tables or protected prose is included. Factual references:

- [CIE 1931 system](https://www.cie.co.at/eilvterm/17-23-045) establishes the meaning of XYZ and the standard observer.
- [Academy encoding documentation](https://docs.acescentral.com/encodings/introduction/) distinguishes linear interchange encodings from downstream encodings.

Neither provides coefficients, and neither imposes ACES.

AI-assisted draft material needs substantive human review of science and provenance, and DCO certification under CONTRIBUTING.md and PROVENANCE.md, before inclusion.
