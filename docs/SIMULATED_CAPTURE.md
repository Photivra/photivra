# Authoritative simulated capture: #15A/#15B

Release context: **package 1.2.0 candidate / root API 1.2.0**. Subsystem/model versions and dated introduction or measurement records below are independent historical identities; they are not distribution versions. See [developer navigation](DEVELOPERS.md) and [release contract](RELEASE_1_2_0.md).

The container commits a format-neutral float master manifest before tone mapping/LDR conversion. It does not itself generate or convert pixels. The separate [#15B color API](CAPTURE_COLOR.md) converts supported planes and [#15C encoding API](LINEAR_CAPTURE_ENCODING.md) quantizes them without mutating the master. TIFF/DNG serialization and production-stage activation remain separate. #15, #112 and #16 are merged. Their explicit adapters own rendering and paired export; the container alone performs neither.

## Image state and storage

`createSimulatedCapture()` validates, copies and deeply freezes input. Its calculated provenance describes structural commitment; upstream model status/evidence identities are preserved independently, never upgraded to calibrated/radiometry-ready.

Planes have separate IDs/image-state IDs, exact raster binding and co-sited, tightly interleaved channels. Row order is top-left origin, +X right/+Y down. Native CFA/mosaic semantics are not inferred from multiple channels.

| State | Required meaning |
| --- | --- |
| scene-referred-xyz | X,Y,Z order; explicit cie-1931-2-degree-xyz profile 1.0.0 and normalized encoding white |
| virtual-sensor-channels | Declared channels/source profile; colorimetric transform/encoding white unresolved |
| color-transformed-linear-rgb | red,green,blue order; encoding profile/white and explicit linear-color transform history |

Samples are relative linear values normalized by referenceWhiteValue, not absolute radiance, photons, electrons or measured commercial-camera RGB. Finite negative values/headroom remain unchanged; NaN/Infinity and sparse arrays fail. Inline signed zero becomes ordinary zero for semantic serialization.

Inline Float64-valued JavaScript number arrays have a one-million-sample aggregate budget. Large images use external-float32/64 references: IEEE 754 little-endian scalars, no header/padding, tightly interleaved row/channel order, complete-plane sample count, opaque public artifact ID and lowercase SHA-256 over exact bytes. No path/URL/runtime IO is introduced. The engine does not read/verify external bytes, finite values, digest or source quality; a future loader must do so before consuming samples. Declared storage precision is not an assertion about renderer precision.

XYZ observer identity documents meaning without spectral integration or copied color tables. RGB profile references are preserved, not resolved into a transform by #15A. A serializer cannot infer color coefficients from a profile name. `resolveSimulatedCapturePlane()` requires the exact requested image state.

## Geometry and deterministic commitment

Reuse of ResolveCaptureGeometryInput preserves native, active, oriented and output geometry, off-center regions and four orientations. Planes must match oriented active capture or output dimensions. Exposure/focal metadata and finite/infinity focus remain explicit. The existing diagonal equivalent-focal-length calculator uses active physical capture; output crop never rewrites it.

Scene time is seconds on the producer's scene clock. Fixed uint32 noise seed, realization/model identity, source checksums, public profile/evidence IDs and engine API version are retained. A seed alone does not prove pixel reproduction; the container does not rerun a renderer/noise generator.

`parseSimulatedCapture()` recomputes and verifies derived geometry/focal equivalence and preserves historical creator API identity. `serializeSimulatedCapture()` emits normalized allowlisted JSON independent of input object property order; list order remains semantic. This is a manifest, not TIFF/DNG or a new cryptographic semantic hash.

## WB, whites and saturation

`createCaptureWhiteBalanceIntent()` consumes #108 resolved state and copies public state/profile identity, source, lock and gains; measurement/debug/free-text extras are discarded. It introduces no AWB estimator or true-illumination oracle:

```ts
import { resolveManualWhiteBalance, createCaptureWhiteBalanceIntent } from "@photivra/engine";
const state = resolveManualWhiteBalance({
  stateId: "wb-1", channelGains: { red: 2, green: 1, blue: 0.5 }
});
const intent = createCaptureWhiteBalanceIntent({ state });
```

Intent and plane application are separate: intent-only, applied-rgb-gains, applied-chromatic-adaptation or not-applicable. Applied gains require compatible RGB channels/resolved intent. Applied adaptation requires adopted white, transformed RGB and explicit adaptation history, independently of RGB intent. Recording does not verify upstream application; the separate #15B API performs actual conversion. Camera RGB gains cannot be directly declared applied to XYZ.

Adopted white and encoding white remain separate normalized XYZ records (Y=1, positive X/Z). Null adopted white is unresolved, not an implicit D65/encoding white. No single physically unique white is claimed under mixed illumination.

Source dynamic-range history is unknown, no-loss-declared or upstream-clipped. Float64 cannot recover prior clipping. Capture saturation is independently unmodeled or a declared virtual white level/upstream clipped-sample count. Reference white, capture saturation, future integer limits, rendering exposure and display white are separate. This API neither clamps samples nor infers clipped counts from values equal to white.

## Public metadata and limits

Unknown fields fail at capture/source/geometry/exposure/model/plane/transform/storage/WB-manifest boundaries. Public opaque IDs/versions permit ASCII alphanumerics plus dot/underscore/colon/hyphen, maximum 128 characters. Paths, slash-bearing URLs and emails fail. No private paths, prompts, internal URLs, proprietary manifests, names/emails, precise locations or hidden debug fields are supported.

Producers must select genuinely public, non-personal IDs. Syntax cannot prove an otherwise valid ID is non-sensitive. Public-ID registry/provenance review remains the producer's responsibility; no arbitrary free-text metadata bag exists.

## Versioning and evidence

Schema is 0.2.0; legacy 0.1.0 archives normalize to 0.2.0 while preserving creator API identity. The new applied-chromatic-adaptation state cannot be declared in a 0.1.0 archive. Re-serialization emits the current schema, so archive bytes change on migration. Root API advances main 0.95.0 to 0.96.0. Package, POC and production contracts are unchanged. This independent branch consumes no pending #157/#158 code; reconcile API identity in final merge order.

Tests reuse #130's canonical fixture for geometry/settings/seed, and cover unclamped data, immutable/canonical archive round trips, four orientations/off-center capture, active/output equivalence, WB sanitization/intent/application, image-state substitution, RGB history, large external planes, saturation distinction, private/malformed metadata, infinity and historical identity.

Implementation/tests are independently authored; no third-party code, calibration data, color tables or protected prose included. Factual references: [CIE 1931 system](https://www.cie.co.at/eilvterm/17-23-045) establishes XYZ/observer semantics; [Academy encoding documentation](https://docs.acescentral.com/encodings/introduction/) distinguishes linear/interchange and downstream encoding. Neither provides coefficients or imposes ACES.

AI-assisted draft requires substantive human science/provenance review and DCO certification under CONTRIBUTING.md/PROVENANCE.md before inclusion.
