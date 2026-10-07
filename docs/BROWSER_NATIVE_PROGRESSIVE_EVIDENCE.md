# Browser-Native Progressive Complete-Event Evidence

Status: **frozen #250 evidence ladder; not full-native qualification**.

This document freezes the complete-event progression used by Photivra engine issue
#250 after the bounded Path-A executor merged in #249 / PR #252.

It supplements, and does not replace:

- `BROWSER_NATIVE_CAPTURE_REFERENCE_EXECUTOR_HANDOFF.md`;
- `BROWSER_NATIVE_CAPTURE_RESOURCE_ACCOUNTING.md`;
- `BROWSER_NATIVE_CAPTURE_NUMERICAL_ACCEPTANCE.md`;
- `BROWSER_NATIVE_CAPTURE_ROBUST_GEOMETRY.md`.

The purpose is to establish measured execution/resource/exactness evidence above
the historical 2×2 pilots without using a scaling projection as a substitute for
the frozen 2048×1366 evidence owned by #251.

## Frozen synthetic ladder

All positive ladder events use the #249 compact prepared Path-A executor with:

- 4 spatial nodes per native site;
- 1 temporal midpoint per native site;
- 128 ideal circular-pupil rays;
- 2 exact spectral nodes at 425 nm and 475 nm;
- static opaque analytic source geometry;
- wavelength-independent visibility;
- explicit engine-owned spectral radiance;
- no sampled PSF;
- zero camera motion;
- existing sensor response, dark current, charge completeness, noise, ADC and RAW;
- exact native CFA/seed/shutter identity;
- unchanged 2,000,000,000 whole-event policy;
- unchanged 100,000 per-source-tile logical provider-evaluation bound.

The resource ladder is:

| Evidence ID | Raster | Shutter | Aperture / focus | Native sites | Unique geometry | Logical spectral/source support |
| --- | ---: | --- | --- | ---: | ---: | ---: |
| BNCE-PROG-001 | 4×4 | global | f/4, infinity | 16 | 8,192 | 16,384 |
| BNCE-PROG-002 | 8×8 | global | f/4, infinity | 64 | 32,768 | 65,536 |
| BNCE-PROG-003 | 16×16 | global | f/4, infinity | 256 | 131,072 | 262,144 |
| BNCE-PROG-004 | 8×8 | right-to-left native scan | f/4, infinity | 64 | 32,768 | 65,536 |
| BNCE-PROG-005 | 4×4 | global | f/8, 5 m | 16 | 8,192 | 16,384 |
| BNCE-PROG-006 | 4×4 | global | f/4, infinity, near-full-well source | 16 | 8,192 | 16,384 |

The synthetic ladder holds **per-site physical sampling geometry constant** while
increasing the complete native raster. Its imaging area therefore grows with the
raster. This is deliberate resource/exactness evidence, not a miniature physical
model of the final 2048×1366 sensor. #251 owns the final frozen native geometry.

## Negative controls

### BNCE-PROG-007 — exact distinct first-hit tie

A complete 4×4 event is prepared with two opaque rectangles at the same first-hit
distance. The float64 source-semantic contract must fail closed before any
authoritative RAW can be taken.

This is a geometry-boundary control, not a passing capture.

### BNCE-PROG-008 — cancellation checkpoint

A complete 4×4 event is cancelled by the batch observer after the first prepared
photo batch. New sensor work must stop at the bounded checkpoint, attempted work
must remain visible, and authoritative RAW must remain unavailable.

### BNCE-PROG-009 — observer failure

A complete 4×4 event throws from the batch observer after the first prepared
photo batch. Attempted scientific/observer work remains counted and authoritative
RAW remains unavailable.

## Exact output / chunk evidence

Each positive event runs twice from the same prepared state:

1. batch size 1;
2. the frozen evidence batch size (up to 16 native sites).

The complete packed output state must match exactly across both executions:

- RAW codes;
- black levels;
- digital saturation codes;
- saturation flags.

Batch size may alter batch/yield counts and timing only.

## Independent expected-signal oracle

For the uniform source cases, expected signal is checked against a separately
coded SI midpoint sum, not an engine reducer.

For each exact wavelength node `lambda`:

`E_lambda = L_lambda * pi/(4*Nworking^2) * T_lambda`

with:

- `L_lambda`: declared source spectral radiance;
- `Nworking`: the same paraxial working f-number used by the optical bridge. It
  equals nominal `N` at infinity focus and `N*(1+m)` for the ideal symmetric
  finite-focus case with unity pupil magnification;
- `T_lambda`: owned synthetic lens transmission;
- sensitive area: 480,000 µm²;
- bin width: 50 nm;
- photon energy: `h*c/lambda`;
- owned synthetic EQE: piecewise-linear 0.2 at 400 nm to 0.6 at 500 nm.

The four spatial nodes and normalized pupil weights integrate a uniform field to
one. One temporal midpoint integrates the static source over the local exposure
duration.

The near-full-well control chooses source radiance from the independent oracle so
the expected generated signal is approximately the 1,000-electron synthetic
physical capacity threshold. Exact seeded RAW parity across batch sizes remains
binding around the clipping/ADC boundary.

## Measurements

The repository qualification harness records, per event:

- exact git revision and relevant source hashes;
- executor/prepared-state versions;
- raster/sample/source identities;
- cold and warm preparation time;
- batch-1 and evidence-batch execution time;
- logical support;
- planned unique geometry;
- actual geometry attempts and reuse hits;
- spectral/optical and source-radiance attempts;
- sensor-site attempts;
- observer attempts and completed batches;
- deterministic output payload bytes;
- empirical RSS/heap/array-buffer snapshots and sampled peaks;
- independent photon/electron oracle relative error;
- complete packed-output SHA-256;
- saturation-flag counts;
- explicit `fullNativeQualified: false`.

JavaScript object-graph heap size is not represented as exact contract bytes.
Deterministic bytes are reported only for explicitly sized output arrays; runtime
heap/RSS remains empirical.

## No extrapolation rule

The harness must not emit a projected 2048×1366 runtime or claim that the ladder
predicts the full-native case.

Successful #250 evidence means only that progressively larger complete events
preserve the frozen science/resource/exactness contracts.

Full-native base/refinement measurement belongs exclusively to #251.

## Measured CI 659 results

Durable machine-readable evidence is retained at
`docs/validation/browser-native-progressive-2026-10-07/ci-659.json`.

The CI runner checked out GitHub's pull-request merge revision
`ee756ff9df68229f5b44a9c82348bc88284ccbac` for PR #253. The corresponding PR branch head was
`ad3d11876c1ca99f3feb64333f3161d6065dd122`. CI run **659** used Node **v24.21.0** on Linux x64 for the
progressive qualification step.

| Evidence | Result | Preparation cold / warm | Evidence-batch execution | Peak RSS / heap | Independent oracle max relative error | Output / control |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| BNCE-PROG-001 — 4×4 global f/4 ∞ | pass | 238.4 / 235.5 ms | 207.0 ms (batch 4) | 163.4 / 46.5 MB | photon 5.60e-16; electron 9.00e-16 | SHA-256 `4ebfafc5551b76fbda89b896a24b1337ed5a52993682c67b620d52def42d1509`; no saturation |
| BNCE-PROG-002 — 8×8 global f/4 ∞ | pass | 806.5 / 757.8 ms | 766.0 ms (batch 8) | 288.2 / 134.0 MB | photon 5.60e-16; electron 9.00e-16 | SHA-256 `ff847494fd2230651dd5e8bfa0f4e2a0e37cc03ba84b0d2de2b46445d19d027d`; no saturation |
| BNCE-PROG-003 — 16×16 global f/4 ∞ | pass | 2967.8 / 3012.3 ms | 3061.0 ms (batch 16) | 514.3 / 333.0 MB | photon 5.60e-16; electron 9.00e-16 | SHA-256 `59c575070818fd65c2d63cd376a0126178d691b40dad5731de97f029d35806b1`; no saturation |
| BNCE-PROG-004 — 8×8 native scan f/4 ∞ | pass | 758.4 / 768.0 ms | 761.4 ms (batch 8) | 443.2 / 144.9 MB | photon 5.60e-16; electron 9.00e-16 | SHA-256 `ff847494fd2230651dd5e8bfa0f4e2a0e37cc03ba84b0d2de2b46445d19d027d`; no saturation |
| BNCE-PROG-005 — 4×4 global f/8, 5 m | pass | 199.7 / 200.1 ms | 213.4 ms (batch 4) | 423.6 / 92.3 MB | photon 7.14e-16; electron 1.65e-15 | SHA-256 `9570e3248ab6997e0714ef69d1e723406e72d4c3a73c6590cd2d32bb8484d62e`; no saturation |
| BNCE-PROG-006 — 4×4 near-full-well | pass | 197.8 / 199.1 ms | 200.7 ms (batch 4) | 424.1 / 76.1 MB | photon 3.54e-16; electron 0 | 1000 expected electrons/site; physical saturation 16/16, pre-ADC 5/16, digital saturation 16/16; exact batch parity |
| BNCE-PROG-007 — exact first-hit tie | expected fail closed | — | — | — | — | one geometry attempt, zero spectral/source/sensor attempts; output unavailable |
| BNCE-PROG-008 — cancellation | cancelled as expected | — | — | — | — | 2,048 geometry + 4,096 spectral/source attempts, zero sensor attempts; output unavailable |
| BNCE-PROG-009 — observer failure | failed as expected | — | — | — | — | 2,048 geometry + 4,096 spectral/source attempts, one observer attempt, zero sensor attempts; output unavailable |

For the largest positive event, BNCE-PROG-003, measured complete-event work was
**131,072** geometry attempts, **131,072** geometry reuse hits,
**262,144** spectral/optical and source-radiance attempts, and **256** sensor-site
attempts. These exactly match the frozen 16×16 logical plan.

All positive events had exact batch/chunk output parity. The independent expected
photon/electron checks remained below the existing BNCE numerical bar by a wide
margin. The near-full-well event exercised clipping/ADC boundaries while retaining
exact seeded output parity.

The measured ladder does **not** expose a #236 activation trigger. It provides
progressive Path-A evidence only. It does not establish or project the 2048×1366
full-native case; that remains #251.

## #250 completion gate

#250 may close only after reviewed evidence shows:

- all positive ladder events complete;
- exact batch/chunk output invariance passes;
- independent expected photons/electrons pass the existing BNCE numerical bar;
- logical/planned/attempted work reconciles;
- memory/output accounting is explicit;
- global and native-scan cases complete;
- focus/aperture control completes;
- near-full-well/ADC control completes with exact seeded output invariance;
- exact-hit-tie geometry fails closed;
- cancellation and observer failure withhold authoritative output;
- no event uses the rejected four-billion ceiling;
- no full-native projection is presented as qualification evidence.

If the measured ladder exposes a Path-A obstruction, record it as evidence for the
existing #236 activation gate rather than weakening accuracy or raising limits.
