# Standalone SDR rendering primitives

> **Release context.** This page was written for package 1.2.0 (root API 1.2.0) and has not been re-reviewed for later releases. The [changelog](../CHANGELOG.md) describes the current release. Model and subsystem version numbers on this page, and any dated records, are separate from the package version. See also the [developer guide](DEVELOPERS.md) and the [1.2.0 release contract](RELEASE_1_2_0.md).

For the current, integrated picture, see [processed camera output](PROCESSED_OUTPUT.md). It documents the shared preview and export path, and the explicit post-RAW activation in plan 0.6.0. This page describes the original primitive (issue #112A) and keeps its original scope.

## What it does

This low-level primitive renders a linear image to SDR (standard dynamic range), deterministically and within fixed limits. The capture, white-balance and correction adapters, and production plan 0.7.0, use it through [processed output](PROCESSED_OUTPUT.md). They keep its domains and order, and share ownership of colour and white balance.

## Input

`calculateSdrRendering()` accepts:

- a declared `color-transformed-linear-rgb` image state;
- the `linear-srgb-d65` colour-space identity;
- a source state ID;
- a co-sited, interleaved RGB raster;
- a relative reference-white value.

**White balance (WB).** `whiteBalanceHandling` must be `already-applied-upstream` or `not-required`. WB that is only an intent, or unresolved, is rejected. This primitive never estimates or applies WB, never converts XYZ, spectral or sensor RGB, and never changes the order of lens corrections.

These input identities are declarations by the producer; they do not verify that upstream pixels are correct. The capture adapter checks them against the authoritative capture and profile history.

**Profiles.** Profiles use schema `0.1.0`, a public ID and version, and explicit policies. No default tone, gamut, transfer or HDR mode is guessed.

**Samples.**

- Inline samples must be finite and dense, and are limited to 262144 values (at most 87381 RGB pixels).
- External storage, streaming and processing at native size are outside this reference executor.
- Raster origin is top left, +X right and +Y down, with red, green and blue tightly interleaved, in row-major order.
- The input is copied, and never changed.

## Stages

| Stage | Defined operation |
| --- | --- |
| Rendering exposure | Multiply source samples by `2^renderingExposureEv/referenceWhiteValue`. EV is bounded to [−32,32]; this is a rendering brightness choice, not aperture/shutter/ISO compensation. Non-finite scale/sample results fail before later processing can hide them. |
| Tone curve | `identity`; `positive-reinhard-per-channel` (unchanged): positive x maps to x/(1+x) (Reinhard et al. 2002, eq. 3), which can change chromaticity and compresses reference white 1 to 0.5; or a luminance curve (2.0) that scales a pixel's three components by f(L)/L, with L = 0.2126·R + 0.7152·G + 0.0722·B taken from the engine's sRGB→XYZ Y row, so chromaticity is preserved until gamut handling. `extended-reinhard-luminance` with `toneCurveParameters: { whiteLuminance: Lw }` uses f(L) = L(1 + L/Lw²)/(1 + L) (Reinhard, Stark, Shirley & Ferwerda 2002, "Photographic tone reproduction for digital images", SIGGRAPH, eq. 4): L = Lw maps to 1. `naka-rushton-luminance` with `{ exponent: n, semiSaturation: σ, whiteLuminance: Lw }` uses f(L) = g(L)/g(Lw), g(L) = Lⁿ/(Lⁿ + σⁿ) (Naka & Rushton 1966, J. Physiol. 185:536; as a tone operator, Reinhard & Devlin 2005, IEEE TVCG 11(1)): a sigmoid in log luminance (contrast n, mid-response σ), i.e. a film-like S-curve, evaluated as 1/(1 + (σ/L)ⁿ) to avoid overflow. Bounds: 0 < Lw ≤ 65536, 0.25 ≤ n ≤ 4, 0 < σ ≤ 64. Nonpositive luminance is left for gamut handling. No calibrated manufacturer look is claimed. |
| Gamut handling | Explicit component clipping to [0,1], with separate low/high sample counts, or rejection of any component outside [0,1]. This is range handling in the defined sRGB basis, not a perceptual/hue-preserving gamut map. |
| Transfer encoding | Standard sRGB component function: 12.92x for x≤0.0031308; otherwise 1.055x^(1/2.4)−0.055. Black/white endpoints return exact 0/1. |
| Quantization | 8 or 16 bits, full range 0..(2^bits−1), nearest exact binary64 ties to larger code (`Math.round` on values in [0,1]; model `generic-sdr-rendering-reference` 0.2.0 replaced `Math.floor(x+0.5)`, which rounded 0.49999999999999994 up), no dither. Packing/file tags belong to the serializer. |
| Display adaptation | Explicit external-platform seam, not applied; actual display capabilities are unknown. |

## Outputs and diagnostics

The result returns separate arrays for each stage: tone-mapped linear, gamut-limited linear, transfer-encoded float, and integer codes. So you can inspect each stage on its own.

**Diagnostics** separately count:

- rendering samples that were negative or above reference before tone mapping;
- samples changed by the tone curve;
- samples actually clipped by gamut handling.

They count channel samples, not pixels.

**Capture saturation is a different thing.** No sensor, full-well, ADC or RAW clipping is inferred here. Capture saturation is `not-consumed` at this stage (RAW development reports `consumed-in-raw-development`). A source clipped upstream may show no output clipping, and an unclipped source can clip in the SDR output. The capture adapter keeps upstream diagnostics separately.

**Declared output encoding.**

- output-referred SDR sRGB;
- RGB primaries at xy (0.64,0.33), (0.30,0.60), (0.15,0.06);
- D65 white at xy (0.3127,0.3290);
- the standard reference-white luminance assumption of 80 cd/m².

This is an encoding and reference convention. It is not evidence that the user's screen emits that luminance. The viewing surround, the display's tone and black, platform colour management, HDR adaptation and display saturation all stay external and unknown. Floating-point headroom in the source does not create a PQ, HLG or HDR encoding.

## Scope

The function does not touch:

- capture settings;
- physical radiometry, noise or saturation;
- metering;
- CFA or reconstruction;
- geometry;
- the WB estimator;
- denoising, sharpening or resampling.

It gives preview and processed export a common rendering intent. It does not require reusing a screenshot or canvas, and does not promise byte-identical results across file and display backends.

It does not replace the authoritative **linear** export encoding ([linear capture encoding](LINEAR_CAPTURE_ENCODING.md)). This primitive quantises **transfer-encoded, processed SDR**, and does not replace the capture encoding API.

## Compatibility and sources

- Root API on main went from `0.96.0` to `0.97.0`. Package, POC and production schemas did not change.
- That was the version that introduced it, not the current release. Package and root API 1.0.1 use one aligned release version, and the processed-output work (#112) is merged.
- Schema and profile changes keep explicit domains and independent version identities.

**Research.** The [ICC sRGB encoding registry](https://registry.color.org/rgb-registry/srgb) defines the standard primaries, the white and reference assumptions, and the component transfer equations. These public numerical facts and equations informed independently written code and tests. No third-party implementation, ICC profile binaries, protected prose, calibration data or colour tables are included.

The `calculated` provenance refers to the deterministic rendering arithmetic. It does not mean physical or perceptual accuracy, or commercial-camera calibration. Human review of science and provenance, and DCO contributor certification, are still required before inclusion.
