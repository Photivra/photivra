# 2.6.0 release candidate

> **Release request.** Prepared October 19, 2026. Publishing is a separate step: the owner tags `v2.6.0` on the `main` commit that merges this record, and npm publishing runs from the tag.

## At a glance

- **What is proposed:** publish `@photivra/engine@2.6.0`, with `ENGINE_API_VERSION = "2.6.0"`. `POC_SIMULATION_API_VERSION` stays `1.0.0`.
- **Why a minor version:** three changes make Quality renders faster without changing their results, and one adds two fields to the framing results. Every `simulateCapture` and `simulateIdealReference` request that 2.5.0 accepted gives byte-identical samples, RAW codes and encoded files, apart from the engine version that captures record. The one other difference is the wording of the `output.region` assumption on region renders with `lens.diffraction`. No root export is added or removed.
- **Why now:** applications render Quality previews as regions and whole-frame views, and each of those spent most of its time on work that does not change the image: convolving whole-width bands of the frame, rebuilding identical diffraction kernels, and re-parsing fixed records of the engine's own chart scenes. Applications also computed the close-up light loss from the framing magnification themselves. The owner approved this release on October 19, 2026, answering "do you approve preparing the final engine release, 2.6.0 (region-limited diffraction, kernel reuse, validation trim, close-up light factor; all byte-identical for existing results), merged after its six checks pass, with you tagging and publishing it yourself?" with "Approve 2.6.0 release prep". The changes merged in #354 (`45bcdcb`), #355 (`fb66b03`), #363 (`3bf431c`) and #364 (`5c1f1f3`).
- **What this release does not claim:** the speed-ups are measured on the hosts named below and are not a promise for every device. The close-up light factor is the ideal thin-lens approximation, not a measured lens.

## Scope

| Change | Public surface | Kind |
| --- | --- | --- |
| Region renders limit the diffraction convolution to the region (#354) | `simulateCapture` with `output.region` and `lens.diffraction`; `output.region` assumption text | Performance; same values |
| Diffraction kernels reused and built faster (#355) | `createDiffractionLimitedPsfProfile`, and so `lens.diffraction` | Performance; same values |
| Less validation overhead for the engine's own chart scenes (#363) | `simulateCapture` with a chart preset | Performance; same values |
| Close-up light factor (#364) | `closeUpTransmission` and `closeUpLossStops` on `calculateChartFraming` and `calculateSubjectDistanceForFraming` results | Additive fields |
| Version 2.6.0, changelog and this record | — | Release preparation |

Nothing else merged after 2.5.0 apart from #353, which recorded the 2.5.0 publication (documentation only). Open engine issues #365 (print planner "contain" fit) and #366 (a source for the diffraction model in the quick start) have no merged work and are not part of this release.

Root exports stay at 1,717 symbols. The generated `docs/api/exports.json` lists the same 1,717 names and entries as at `v2.5.0`; only its version fields change. The two new fields are properties of the existing `ChartFraming` and `SubjectFraming` results.

## What changed, with evidence

### Region renders: diffraction limited to the region (#354)

With `output.region` and `lens.diffraction`, the object-space convolution used to cover whole-width bands of 32 native rows, so a small crop of a wide frame paid for the full frame width. The diffracted scene provider now takes the region's native rectangle as a window and convolves only the lattice those sites query: the rectangle plus the anti-aliasing filter and box-aperture offsets, with the kernel radius of real scene radiance around it.

**Why the values cannot change.** The convolution is a direct gather with a fixed tap order and one kernel patch. In the whole render every kept value already has all its taps inside the grid, so a narrower grid that still holds every tap of every kept value gives the same values bit for bit; it only drops values that no query reads. Noise needs no frame-wide state (per-site streams seeded from the capture seed and the absolute native index), and demosaicing, the four-spot filter and the box aperture already read only the region plus its margin.

Tests (`test/simulate-capture-region-diffraction.test.ts`):

- Region against whole-frame crop, byte for byte (samples and native RAW codes), with diffraction, the four-spot filter, AHD and a 2 × 2 box (one 4 × 4 case): centre, two corners, two edges, 1-pixel strips and the full frame; pitches 2, 6, 48 and 250 µm; f/4 to f/16; and a bilinear case without the filter.
- The provider gives bit-identical values inside the window, takes exactly (rows + 2M + 2R) × (columns + 2M + 2R) scene samples, and refuses queries outside the window.

Timings, 192 × 128 centre crop of a 6000 × 4000 frame at 6 µm, Siemens star, f/16, same image hash before and after:

| Options | 2.5.0 (convolution) | 2.6.0 (convolution) |
| --- | --- | --- |
| Local 4-vCPU host, Node 24: diffraction, four-spot, AHD | 60.8 s (50.2 s) | 11.8 s (1.7 s) |
| Local: with a 2 × 2 box as well | 228.7 s (195.8 s) | 39.6 s (6.5 s) |
| GitHub-hosted 4-vCPU runner, Node 24: diffraction, four-spot, AHD | 44.14 s (37.06 s) | 8.32 s (1.37 s) |
| GitHub-hosted runner: with a 2 × 2 box as well | 170.85 s (147.72 s) | 27.66 s (4.93 s) |

Peak memory for the local box case fell from 1,285 MB to 545 MB. The remaining time is per-site work (20 spectral nodes × filter spots × box nodes), which follows the region, not the frame.

### Diffraction kernels reused and built faster (#355)

`createDiffractionLimitedPsfProfile` keeps the 256 most recently used Airy cell tables, keyed by every input of the cells (β = pitch/(λ·N_w), the kernel radius and the scale), and hands out copies, so a caller cannot change a cached table. The frequency-domain quadrature takes cos θ and sin θ from a table computed with the same expressions, which removes two of six transcendental calls per node. The model is the one 2.1 and 2.5 introduced (incoherent OTF of a circular pupil, [MIT OpenCourseWare 2.71, lectures 21–22](https://ocw.mit.edu/courses/2-71-optics-spring-2009/resources/mit2_71s09_lec22/), free; real-space encircled energy from [DLMF §10.6(i)](https://dlmf.nist.gov/10.6) and the Hankel expansion [DLMF 10.17.3](https://dlmf.nist.gov/10.17), free); see [PSF foundation](PSF_FOUNDATION.md).

The β ≥ 192 switch to the real-space method stays where it is. The Hankel expansion needs x = π·β/2 ≥ 300 at the innermost cell boundary, so it cannot go below β = 191, and another Bessel method would change today's cells in the last bits.

Tests (`test/diffraction-psf-profile.test.ts`): SHA-256 of the cell bytes at β = 0.4, 12.5, 60, 123.3, 191.9 and 250 are locked against 2.5.0, from the uncached functions and from the cache (first and repeated call); changing a returned copy does not change later results; a repeated profile build takes under a quarter of the first.

Timings (kernel build alone, 20 wavelengths, f/16, radius 1, local 4-vCPU host, Node 24):

| Pitch | 2.5.0 first / repeat | 2.6.0 first / repeat |
| --- | --- | --- |
| 375 µm | 417 / 303 ms | 355 / 2 ms |
| 456.25 µm | 675 / 563 ms | 465 / 2 ms |
| 750 µm | 1,630 / 1,042 ms | 1,370 / 4 ms |
| 912.5 µm | 2,286 / 1,530 ms | 1,648 / 1 ms |

Whole-frame Quality captures (diffraction, four-spot, AHD, f/16) on a GitHub-hosted 4-vCPU runner; "repeat" is a second capture in the same process with a different exposure; same image hashes:

| Case | 2.5.0 first / repeat | 2.6.0 first / repeat |
| --- | --- | --- |
| Full frame 48 × 32 (750 µm) | 2.26 / 1.66 s | 2.13 / 0.76 s |
| Medium format 48 × 32 (912.5 µm) | 2.51 / 1.96 s | 2.17 / 0.67 s |
| Full frame 96 × 64 (375 µm), 2 × 2 box | 6.99 / 6.79 s | 6.90 / 6.47 s |
| Medium format 96 × 64 (456.25 µm), 2 × 2 box | 7.07 / 6.99 s | 6.96 / 6.54 s |

Workers do not share memory, so each worker still builds a frame's kernels once.

### Less validation for the engine's own chart scenes (#363)

For scene results that come from the engine's own chart-scene evaluator, the native environment skips two things: the unknown-key scan of the result record, and re-parsing `uncertainty`, `evidence` and `limitations` when all three are the same objects as an earlier result's that passed the full parse and were found deeply frozen. Every other check still runs with the same helpers, order and messages (shape, schema version, quantity, unit, status, identifiers, wavelength, basis, and a finite, non-negative radiance). Caller scenes and caller providers keep the full validation. The mark is a module-private `WeakSet` on the evaluator function, not exported from the package.

Tests (`test/internal-scene-evaluator.test.ts`):

- An audit wraps the reduced parse and runs the full parse on the same value each time: over 10,000 reduced parses across all 16 chart presets, diffraction with the four-spot filter, 2 × 2 box, AHD and a region, a fixed chart size, a 750 µm pitch and auto white balance, with zero mismatches.
- Caller scenes and caller providers get zero reduced parses; a caller provider with an unknown key on its 500th result is still refused.
- For 18 corrupted inputs the reduced parse throws the full parse's exact message.

Timings on a GitHub-hosted 4-vCPU runner, median of three alternating runs, identical image hashes: the 192 × 128 Quality crop with a 2 × 2 box took 19.41 s instead of 29.28 s, and a 96 × 64 whole-frame Quality capture at 375 µm 4.86 s instead of 7.45 s.

### Close-up light factor (#364)

`calculateChartFraming` and `calculateSubjectDistanceForFraming` results gain:

- `closeUpTransmission` = 1/(1 + m)², with m = v/s the thin-lens magnification at the focus distance: the image-plane irradiance relative to the same lens and f-number at infinity focus;
- `closeUpLossStops` = 2·log₂(1 + m), the same factor in stops.

Science: for an ideal thin lens with unity pupil magnification the image distance is v = f·s/(s − f), so the working f-number is N_w = N·v/f = N·(1 + m), and image-plane irradiance falls as 1/N_w² (the camera equation; [MIT OpenCourseWare 2.71](https://ocw.mit.edu/courses/2-71-optics-spring-2009/), free; the 1/N² dependence of focal-plane exposure, H = 0.65·L·t/N², is in CIPA DC-004-2020 §5.5, free). Both fields come from one internal function, which the scene-to-sensor irradiance also uses for its working f-number with the same arithmetic as before, so the reported factor and the simulated signal cannot drift apart. The docs label it the thin-lens model: real lenses whose pupil magnification is not one differ.

Tests (`test/close-up-light.test.ts`): `closeUpTransmission` equals 1/((1 + m)(1 + m)) from the thin-lens image distance exactly, and `closeUpLossStops` equals −log₂ of it, at 0.4–100 m; with a separate focus distance the factor follows the focus distance; `calculateSubjectDistanceForFraming` agrees with `calculateChartFraming` at its distance; and the mean (code − black) of a uniform 50 % chart from `simulateCapture` at 0.35 m against 50 m matches the ratio of the two transmissions within 0.5 %.

`simulateCapture` results do not gain the field: adding it would change the bytes of every capture result. An application calls `calculateChartFraming` with the capture's sensor, lens and distances, which is the same framing.

## Compatibility

- **Additive:** two fields on the framing results. No root symbol is added or removed.
- **Byte-identical for every capture and ideal-reference request 2.5.0 accepted:**
  - A fingerprint of 15 default-path results, taken on this candidate, matched `v2.5.0` byte for byte once the engine version is normalized (41 occurrences in each, the only difference). It covers 12 `simulateCapture` requests and 3 `simulateIdealReference` requests, and each result is compared whole: samples, RAW codes, encoded bytes, assumptions, plan, request, exposure, scene digest, diagnostics (timings zeroed) and provenance.
  - Every existing hash lock passes unchanged, together with the new diffraction cell-byte locks (#355). The DNG locks write the Software tag's engine version back to their locked name, so the version bump needs no test change.
  - The region identity tests (`test/simulate-capture-region.test.ts`, `test/simulate-capture-region-diffraction.test.ts`) pass: regions stay byte-identical to the same pixels of the whole render.
- **Known text change (#354):** on a region render with `lens.diffraction`, the last sentence of the `output.region` assumption now reads "With lens.diffraction the object-space convolution (when it applies) covers only the lattice the region's native sites query (plus the kernel radius), in bands of at most 32 native rows; its values are the whole render's." instead of "With lens.diffraction the object-space convolution runs over whole-width bands of 32 native rows that the region touches." Its samples, RAW codes and files are unchanged. Region renders without diffraction, and all renders without a region, keep the 2.5.0 text.
- **`createDiffractionLimitedPsfProfile`** returns the same values; a repeated call in the same JavaScript realm returns copies from its cache.

## Rights and licensing

No third-party code, data or constants are added. No dependency change: `package.json` and `package-lock.json` change only in their version fields.

## Privacy and security

No network, persistence or telemetry is added. The kernel cache is in-memory, per JavaScript realm, bounded at 256 tables (about 2.2 MB), and holds only values computed from numeric inputs; it hands out copies. The reduced scene-result parse applies only to the engine's own evaluator, identified by a module-private mark that callers cannot set; caller scenes and providers keep the full validation.

## Release gates

The authoritative result is GitHub CI on the exact commit that is tagged: the `main` commit that merges this record. Tag it only when its CI is green. Local results on this candidate are recorded in its pull request.

## Remaining release checklist

- [x] The 2.6.0 changes merged with their changelog entries (#354, #355, #363, #364).
- [x] Version surfaces aligned at 2.6.0 (`npm run release:prepare -- 2.6.0`); API reference regenerated (1,717 root symbols; none added or removed).
- [ ] Owner's review of this record.
- [ ] Green CI on this pull request, then on `main` after merge.
- [ ] **The owner's explicit approval to tag `v2.6.0`.**
- [ ] After publication: npm version, dist-tag, integrity and provenance verified; GitHub release notes published; publication dates updated in `CHANGELOG.md`, `README.md`, `SECURITY.md` and this record.
