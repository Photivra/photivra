# Regional detail bounded capture-SDR evidence 0.1.0

This addendum to [the regional diagnostic protocol](PRINT_DETAIL_VALIDATION.md) records execution through the public `createSimulatedCapture` → `calculateCaptureSdr` → test-only quantized-code readback → `calculatePrintRegionDetail` path. It does not change the metric, public API, or historical mathematical qualification record. Human scientific and source review remains pending. Full #196 acceptance remains blocked.

## Source and independent reference

`test/fixtures/print-detail/quarter-grating.json` commits a 16 × 12 neutral linear-sRGB/D65 target. Its repeated values are `[0.6, 0.4, 0.2, 0.4]`: mean 0.4, fundamental amplitude 0.2, modulation 0.5. Values are co-sited neutral RGB, so each equal channel is the relative luminance; this does not qualify colored target luminance extraction. This is owned procedural draft data, with no measured scene or commercial-camera calibration.

`generate_reference.py` uses only Python's standard library and no engine imports to reproduce source bytes and `sdr-reference.json`. Run `python test/fixtures/print-detail/generate_reference.py`. The reference independently applies the repository's documented sRGB transfer and nearest-ties-up quantization to the three discrete levels. For decoded levels A, B, C, discrete orthogonality gives mean `(A + 2B + C)/4`, amplitude `abs(A-C)/2`, and modulation amplitude/mean. A remaining second harmonic can occur after quantization; it is not noise, compression or a quality classification.

The reference commits SHA-256 for exact source JSON bytes, each registered RGB plane as interleaved float64 little-endian bytes, and each integer output as uint16 little-endian bytes (also for 8-bit codes). Tests verify these hashes against actual source and adapter output. Decoder floating values are checked within absolute 1e-12 of the independent Python reference, since power-function implementations may differ in the last binary64 bit. The actual runtime decoded RGB plane is separately hashed as float64 little-endian bytes and its exact hash carried into the diagnostic input/result; the diagnostic itself remains `caller-declared-unverified` and performs no artifact IO. Hash agreement establishes byte identity within this test path, not acquisition truth or reusable rights.

## Finite execution envelope

| Dimension | Evidence envelope |
| --- | --- |
| Source | One committed neutral, positive, in-range quarter-cycle target; no stochastic noise |
| Registration | Owned explicit native-to-oriented discrete permutation; four orientations, no warp or resampling |
| Raster | Native 16 × 12; oriented 16 × 12 or 12 × 16 |
| Region | Half-open 8 × 8 region beginning at `(2,2)`; x- or y-directed two cycles, orientation-dependent phase |
| Capture state | Explicit already-transformed linear-sRGB/D65, declared owned neutral encoding history, WB not required |
| Adapter | Capture-SDR schema 0.1.0, identity tone, zero rendering EV, reject out-of-range, no dither |
| Quantization/readback | 8 and 16 bits; test-only inverse transfer of integer codes, no image file codec |
| Reference checks | Exact source/plane/code hashes; all decoded pixels and independent region mean/modulation/transfer within 1e-12 |
| Backend | Repository Node execution; CI runtime matrix and exact commit/run recorded in the draft PR |

The adapter consumes an already oriented plane; it does not execute the orientation permutation. Tests establish this declared registration independently before execution. They preserve capture identity and source history and assert that rendering does not mutate the capture. Geometry/orientation mathematical tests remain in the original protocol. This evidence does not qualify the UI's active renderer, GPU, native-resolution producer, memory envelope, device display, RAW/environment acquisition, color conversion, clipping accuracy, JPEG compression, physical optical MTF, depth/occlusion, observer perception, or printer/substrate response.

The capability record is [print-detail-sdr-evidence.json](validation/print-detail-sdr-evidence.json). Previous records and their hashes remain unchanged. Rerun this evidence when the target, reference, capture adapter, SDR renderer, diagnostic or test registration changes; do not extend the finite envelope from a passing parser or procedural generator. The new UI still requires reviewed actual source/backend evidence for its own execution path and the remaining scoped quality dimensions.
