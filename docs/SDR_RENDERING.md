# Standalone SDR rendering primitives: #112A

Release context: **package 1.2.0 candidate / root API 1.2.0**. Subsystem/model versions and dated introduction or measurement records below are independent historical identities; they are not distribution versions. See [developer navigation](DEVELOPERS.md) and [release contract](RELEASE_1_2_0.md).

Current integration: [processed camera output](PROCESSED_OUTPUT.md) documents
the shared preview/export path and explicit plan 0.6.0 post-RAW activation.
The historical slice descriptions below retain their original scope.


This low-level primitive defines bounded deterministic post-capture SDR rendering. Merged capture/WB/correction adapters and production plan 0.7.0 now integrate it through [processed output](PROCESSED_OUTPUT.md), preserving domain/order and shared color/WB ownership.

`calculateSdrRendering()` accepts a declared `color-transformed-linear-rgb` image state, `linear-srgb-d65` color-space identity, source state ID, co-sited interleaved RGB raster and relative reference-white value. `whiteBalanceHandling` must be `already-applied-upstream` or `not-required`. Intent-only/unresolved WB is rejected; this primitive never estimates/applies WB, converts XYZ/spectral/sensor RGB or changes lens-correction order. These input identities are producer declarations, not verification of upstream pixel fidelity. The capture adapter verifies them against the authoritative capture/profile history.

Profiles use schema `0.1.0`, public ID/version and explicit policies. No default tone/gamut/transfer or HDR mode is guessed. Inline samples are finite, dense and limited to 262144 values (at most 87381 RGB pixels); external storage/streaming/native-size processing remains outside this reference executor. Top-left raster origin, +X right/+Y down, tightly interleaved red/green/blue, row-major. Input is copied and never mutated.

| Stage | Defined operation |
| --- | --- |
| Rendering exposure | Multiply source samples by `2^renderingExposureEv/referenceWhiteValue`. EV is bounded to [−32,32]; this is a rendering brightness choice, not aperture/shutter/ISO compensation. Non-finite scale/sample results fail before later processing can hide them. |
| Tone curve | Identity, or positive per-channel Reinhard: positive x maps to x/(1+x); nonpositive values are retained until explicit gamut handling. This generic choice can change chromaticity and compresses reference white 1 to 0.5. No calibrated manufacturer look is claimed. |
| Gamut handling | Explicit component clipping to [0,1], with separate low/high sample counts, or rejection of any component outside [0,1]. This is range handling in the defined sRGB basis, not a perceptual/hue-preserving gamut map. |
| Transfer encoding | Standard sRGB component function: 12.92x for x≤0.0031308; otherwise 1.055x^(1/2.4)−0.055. Black/white endpoints return exact 0/1. |
| Quantization | 8 or 16 bits, full range 0..(2^bits−1), nearest exact binary64 ties to larger code, no dither. Packing/file tags belong to the serializer. |
| Display adaptation | Explicit external-platform seam, not applied; actual display capabilities are unknown. |

The returned tone-mapped linear, gamut-bounded linear, transfer-encoded float and integer arrays let consumers inspect the stages independently. Diagnostics distinguish pre-tone negative/above-reference rendering samples, tone-changed samples and actual gamut-clipped samples. They count channel samples, not pixels. No sensor/full-well/ADC/RAW clipping is inferred; capture saturation is `not-consumed`. A source clipped upstream may have no output clipping, while an unsaturated source can clip in SDR output. The capture adapter retains upstream diagnostics independently.

Output declares output-referred SDR sRGB, RGB primary xy coordinates (0.64,0.33), (0.30,0.60), (0.15,0.06), D65 white xy (0.3127,0.3290), and the standard reference-white luminance assumption 80 cd/m². This is an encoding/reference convention, not evidence that the user's screen emits that luminance. Actual viewing surround/display tone/black, platform color management, HDR adaptation and display saturation remain external and unknown. Floating-point source headroom does not establish PQ/HLG/HDR encoding.

The function touches no capture settings, physical radiometry/noise/saturation, metering, CFA/reconstruction, geometry, WB estimator, denoise/sharpen or resampling. It serves a common preview/processed-export rendering intent; it does not require screenshot/canvas reuse or promise byte-identical file/display backends. It does not replace #15C's authoritative **linear** export encoding: this primitive quantizes **transfer-encoded processed SDR** and does not replace the capture encoding API.

Compatibility: root API main `0.96.0` → `0.97.0`; package/POC/production schemas unchanged. This is the historical introduction version, not the current release version. Current package/root API 1.0.1 uses aligned release identity; #112 is merged. Schema/profile changes preserve explicit domains and independent version identities.

Research: [ICC sRGB encoding registry](https://registry.color.org/rgb-registry/srgb) defines the standard primaries, white/reference assumptions and component transfer equations. These public numerical facts/equations inform independently authored code/tests; no third-party implementation, ICC profile binaries, protected prose, calibration data or color tables are incorporated. Calculation provenance refers to deterministic rendering arithmetic, not physical/perceptual accuracy or commercial-camera calibration. Human science/provenance review and DCO contributor certification remain required before inclusion.
