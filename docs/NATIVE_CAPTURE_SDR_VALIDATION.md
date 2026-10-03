# Native capture SDR validation

This is owned synthetic mathematical/resource evidence for schema 0.1.0. It is not device/backend qualification, calibrated camera accuracy, source artifact authentication or human review. Public contract and limitations are in [bounded native SDR](NATIVE_CAPTURE_SDR.md).

On 2026-10-03, Node 24.19.0 on darwin/arm64, the repository benchmark produced these sampled values. It yields with setImmediate and evaluates an analytic RGB ramp directly into bounded float64 tiles, so it does not allocate a full-size linear source. Source/digest declarations are synthetic placeholders. Baseline process memory is sampled before each raster; GC runs between cases but does not necessarily return resident memory to the OS. These are sequential runs in one process, not clean-start comparisons.

| Raster | Codes | Elapsed | Output payload | Largest provider tile | Sampled peak RSS | Sampled peak heap |
| --- | --- | --- | --- | --- | --- | --- |
| 3000 × 2000 | 8-bit | 2.310 s | 18.0 MB | 196,608 bytes | 229.49 MB | 84.28 MB |
| 6000 × 4000 | 8-bit | 9.120 s | 72.0 MB | 196,608 bytes | 317.54 MB | 93.44 MB |
| 3000 × 2000 | 16-bit | 2.335 s | 36.0 MB | 196,608 bytes | 312.49 MB | 83.21 MB |

Raw measurements, baseline values and output hashes are retained in [the machine-readable record](validation/native-capture-sdr-darwin-arm64.jsonl). Earlier development-candidate runs produced the same 8/16-bit output hashes; the retained record is from the aligned 1.2.0 candidate. The 16-bit hash describes typed-array backing bytes in this host's endian order, not a portable serialized format. No peak-allocation guarantee or CPU/device threshold is inferred from sampling. The 1,441,792-byte logical tile scratch bound excludes JS object/array/GC overhead; the measurements visibly exceed it. Provider/master/GPU/encoder retained costs remain external caller obligations.

Regression acceptance compares exact integer pixels, encoding and aggregate clipping diagnostics against the unchanged reference for 259 × 33 rasters crossing all tile boundaries, at 8/16 bits. Additional tests cover upstream engine-resolved WB, all four oriented off-center capture geometries, ignored stride padding, float32/float64, Reinhard, independent sRGB rounding/tie endpoints, 1.2 MP global pixel coordinates, rejected source/color/state/resource inputs, stale rectangles/identities, oversized backing buffers and nonfinite image samples. Lifecycle tests cover pending-read and between-tile aborts, late completion, explicit output transfer, failed host yield, cancellation/disposal of ready/completed tasks, immutable setup/callback commitments and fresh-task recovery.

Initial candidate validation: 1,735 tests passed under full coverage; statements 91.94%, branches 88.36%, functions 99.62%, lines 91.89%. Static/security/license/SPDX/identity/browser gates, build, generated documentation and packed consumer acceptance passed. The packed acceptance executes the new typed root-import example independently of the source checkout. Package dry-run passed with root exports only. CI repeats standard acceptance on Node 22.13/22/24/26 and the native-raster benchmark on Node 24.

## Technical review follow-up

The [review record](NATIVE_CAPTURE_SDR_REVIEW.md) documents scientific/source/execution assessment and outstanding human/DCO gates. The follow-up adds exact float32/float64 parity across both tone/gamut policies and code depths, reference pixels for all four off-center orientations, valid-container pending WB rejection, shared backing-buffer rejection, pending-yield disposal and actual timer cancellation. Full local checks and coverage passed with 1,739 tests on Node 26.8.1; the coverage percentages above are unchanged.

On 2026-10-03, Node 26.8.1 on the same darwin/arm64 host, a sequential benchmark run after the test/consumer checks completed produced:

| Raster | Codes | Elapsed | Output payload | Largest provider tile | Sampled peak RSS | Sampled peak heap |
| --- | --- | --- | --- | --- | --- | --- |
| 3000 × 2000 | 8-bit | 2.346 s | 18.0 MB | 196,608 bytes | 190.64 MB | 90.03 MB |
| 6000 × 4000 | 8-bit | 9.114 s | 72.0 MB | 196,608 bytes | 258.82 MB | 80.96 MB |
| 3000 × 2000 | 16-bit | 2.294 s | 36.0 MB | 196,608 bytes | 280.15 MB | 93.14 MB |
| 6000 × 4000 | 16-bit | 9.167 s | 144.0 MB | 196,608 bytes | 412.14 MB | 80.92 MB |

The [follow-up machine-readable record](validation/native-capture-sdr-darwin-arm64-node26-review.jsonl) preserves baselines, sampled peaks and hashes. All three earlier raster/code-depth hashes agree with the original Node 24 record. The new maximum 24 MP/16-bit backing-byte hash is `b4ab10fe9f6b8f083c5637561aa2a61fe447774b86504a8551b8cc784c815626`. Its host-endian interpretation and all earlier resource/source qualification limitations apply. Earlier measurements are retained; differences across runtimes/runs do not establish a performance improvement.

The package/root candidate identity is 1.2.0, aligned with lock/citation and regenerated references. npm registry verification on 2026-10-03 found 1.1.0 as the latest published version and no 1.2.0 distribution. Follow [the 1.2.0 release procedure](RELEASE_1_2_0.md) after human review to run exact tag/publish gates. No existing published version is overwritten; implementation, human review, merge and publication are separate. #215's publication acceptance remains pending until that reviewed distribution exists. A consumer still requires a qualified authoritative RGB producer and measured device budgets before production activation.
