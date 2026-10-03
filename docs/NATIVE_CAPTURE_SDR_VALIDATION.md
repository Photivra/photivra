# Native capture SDR validation

This is owned synthetic mathematical/resource evidence for schema 0.1.0. It is not device/backend qualification, calibrated camera accuracy, source artifact authentication or human review. Public contract and limitations are in [bounded native SDR](NATIVE_CAPTURE_SDR.md).

On 2026-10-03, Node 24.19.0 on darwin/arm64, the repository benchmark produced these sampled values. It yields with setImmediate and evaluates an analytic RGB ramp directly into bounded float64 tiles, so it does not allocate a full-size linear source. Source/digest declarations are synthetic placeholders. Baseline process memory is sampled before each raster; GC runs between cases but does not necessarily return resident memory to the OS. These are sequential runs in one process, not clean-start comparisons.

| Raster | Codes | Elapsed | Output payload | Largest provider tile | Sampled peak RSS | Sampled peak heap |
| --- | --- | --- | --- | --- | --- | --- |
| 3000 × 2000 | 8-bit | 2.336 s | 18.0 MB | 196,608 bytes | 231.65 MB | 83.99 MB |
| 6000 × 4000 | 8-bit | 9.479 s | 72.0 MB | 196,608 bytes | 319.60 MB | 92.55 MB |
| 3000 × 2000 | 16-bit | 2.317 s | 36.0 MB | 196,608 bytes | 315.36 MB | 84.08 MB |

Raw measurements, baseline values and output hashes are retained in [the machine-readable record](validation/native-capture-sdr-darwin-arm64.jsonl). A prior 6/24 MP run produced the same 8-bit hashes. The 16-bit hash describes typed-array backing bytes in this host's endian order, not a portable serialized format. No peak-allocation guarantee or CPU/device threshold is inferred from sampling. The 1,441,792-byte logical tile scratch bound excludes JS object/array/GC overhead; the measurements visibly exceed it. Provider/master/GPU/encoder retained costs remain external caller obligations.

Regression acceptance compares exact integer pixels, encoding and aggregate clipping diagnostics against the unchanged reference for 259 × 33 rasters crossing all tile boundaries, at 8/16 bits. Additional tests cover upstream engine-resolved WB, all four oriented off-center capture geometries, ignored stride padding, float32/float64, Reinhard, independent sRGB rounding/tie endpoints, 1.2 MP global pixel coordinates, rejected source/color/state/resource inputs, stale rectangles/identities, oversized backing buffers and nonfinite image samples. Lifecycle tests cover pending-read and between-tile aborts, late completion, explicit output transfer, failed host yield, cancellation/disposal of ready/completed tasks, immutable setup/callback commitments and fresh-task recovery.

Local final validation: 1,734 tests passed under full coverage; statements 91.94%, branches 88.36%, functions 99.62%, lines 91.89%. Static/security/license/SPDX/identity/browser gates, build, generated documentation and packed consumer acceptance passed. The packed acceptance executes the new typed root-import example independently of the source checkout. Package dry-run passed with root exports only. CI repeats standard acceptance on Node 22.13/22/24/26 and the native-raster benchmark on Node 24.

The main package/root identity stays at the current 1.1.0 development candidate in this implementation PR. Release owner must reconcile the actually published baseline and select an unused compatible package/root version, regenerate references/lock/citation and run exact tag/publish gates before releasing this additional API. No existing published version is overwritten; implementation, human review, merge and publication are separate. #215's publication acceptance remains pending until that reviewed distribution exists. A consumer still requires a qualified authoritative RGB producer and measured device budgets before production activation.
