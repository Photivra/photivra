# Changelog

## Unreleased

### Added

- **One exact-or-fast flag for every slow option (#395, stage 2): `fast`, `SIMULATE_CAPTURE_FAST_OPTIONS` and `diagnostics.fast`.** No option has a fast method yet, so every result is the same as before.
  - **The flag:** `fast?: boolean` on the `simulateCapture` request (and so on `simulateDisplayView` and `prepareDisplayView`, which take the same request). `false` or omitted is exact, the engine reference; `true` asks each listed option for its fast method, a measured, bounded approximation. An option's record `fast` overrides the top-level flag for that option only.
  - **The options:** `SIMULATE_CAPTURE_FAST_OPTIONS` lists `lens.diffraction`, `sensor.antiAliasing`, `sensor.pixelAperture.box` and `output.demosaic.ahd`. Each takes a record with `fast`: `lens.diffraction` `{ kind: "circular-aperture", kernelRadiusSamples?, fast? }`, `output.demosaic` (new record form) `{ kind: "bilinear" | "ahd", fast? }`, and the existing `sensor.antiAliasing` and `sensor.pixelAperture` records gain `fast?`. An option without a fast method accepts the flag, runs exact and reports `false`.
  - **The report:** captures and display views carry `diagnostics.fast = { requested, applied, assurance }`: whether `fast: true` was given anywhere, each listed option that ran (true where its fast method ran) and `engine-reference` or `approximation-with-a-priori-bound`. The WebGPU image-kernel execution record gains `fast` (`false` for `cpu-reference`, `true` for `webgpu-f32`).
  - **Same output:** every request gives the same samples, RAW and files as before; a new test (`test/fast-flag-convention.test.ts`) checks each listed option with the flag on, off and overridden, and enforces the convention documented in `docs/API_STYLE.md`, "Exact and fast modes".
  - New root exports: `SIMULATE_CAPTURE_FAST_OPTIONS` and the types `SimulateCaptureFastOption`, `SimulateCaptureFastReport` and `SimulateCaptureDemosaicRecord`.

### Deprecated

- **`lens.diffraction`'s `aperture` key (#395): use `kind`.** `{ aperture: "circular-aperture" }` is still accepted, with the same result, until 3.0.0; giving both `kind` and `aperture` is an error.

## 2.9.0 — published October 26, 2026

A minor release: new functions for writing a whole-frame DNG from region parts and a Print JPEG in strips, and a faster display view and Quality preview. Results are the same as 2.8.1, except display views and binned frames whose diffraction cells have β ≥ 32, which change in the last bits.
- **New:** `serializeSimulatedCaptureDngFromParts` joins region parts' RAW into a DNG with the bytes of one whole-frame run. `createPrintJpegStrip` and `composePrintJpegStrips` write a 1:1 Print JPEG's rows on separate workers and join them into the bytes of `createPrintJpegTask`. In the Photivra app, on four browser workers:
  - a 24 MP DNG takes 23.8 s instead of 79.1 s (Speed) and 46.2 s instead of 158.0 s (Quality);
  - a 24 MP JPEG takes about 20 s instead of 32–35 s (Speed) and about 40 s instead of 53–59 s (Quality).
- **Faster preview:** in the app's Quality preview (Chromium, four workers), the quick frame takes 0.7 s instead of 4.0 s, and the fully sharp preview 65 s instead of 170 s.
- **Faster captures:** a 24 MP chart capture takes 16.4 s instead of 18.5 s, and with AHD 28.5 s instead of 33.6 s (Node, one thread), with the same bytes.
- **Compatibility:** five new root exports (1,734); no option, default or result field changes. `createDisplayViewExpectedSignal`, which is internal, takes an optional span hint.

### Added

- **A Print JPEG written in strips: `createPrintJpegStrip` and `composePrintJpegStrips`.** At 1:1, a Print JPEG's rows can be coded on separate workers and joined into the file `createPrintJpegTask` writes for the same plan and pixels, with the same bytes. Only each strip's first block depends on the strip before it, through its DC differences; the join codes that block and copies the rest of the strip's bits.
  - **Same bytes:** tests compare the joined file with the task's file for several splits, crops, quantization steps and a density. The Photivra app's 24 MP JPEG from strips equals the engine's whole-frame JPEG in Speed and Quality.
  - **Measured:** 24 MP, Node, one thread: the whole task 8.1 s; four strips 1.9 s each; the join 1.1 s for a 64 MB file. In the app (Chromium, four workers), writing the JPEG takes about 3 s instead of 9–12 s. A full-size Speed JPEG export takes 19.7–21.0 s instead of 32–35 s, and Quality 39.9–40.2 s instead of 53–59 s.
  - The whole-image JPEG writer and the strips share one block coder, and the existing byte-identity tests pass.
  - New root exports: `createPrintJpegStrip`, `composePrintJpegStrips`, and the types `PrintJpegStripInput`, `PrintJpegStrip` and `JpegStripBits`.

- **A whole-frame DNG from region parts (#391): `serializeSimulatedCaptureDngFromParts(options, parts)`.** A large DNG's RAW can now render in parallel: render region parts of the request (any format), pass each part's `raw` and `region`, and the function joins their native sites and writes the DNG exactly as `simulateCapture` writes it, with the same bytes. Parts must cover the native raster and agree where they overlap; a part from another request is refused. Parts take a fixed white balance and no `output.dng`; auto white balance and the capture time apply to the DNG options and are measured over the joined frame.
  - **Same bytes:** tests compare the joined DNG with the whole-frame DNG for bilinear and AHD, diffraction with the four-spot filter and the 2 × 2 box, auto white balance with a capture time, a reflectance-function scene and the environment path; on the Photivra app's 24 MP request both presets gave the same bytes.
  - **Measured** (24 MP, 24 parts of about 1024 pixels, Node, one thread): parts 58.1 s of CPU against 50.6 s for one whole render (Quality options 119.3 s against 113.6 s), join 2.6 s. On four workers the wall time is roughly a quarter of the whole render's.
  - New root exports: `serializeSimulatedCaptureDngFromParts` and the type `SimulateCaptureDngPart`.

### Faster, same output

- **Captures with AHD demosaic: development about 3× cheaper around the demosaic (#420).**
  - **What changed:** after the AHD demosaic, each output pixel looked up its native site through the full raster-point transform (validation and two new objects per pixel) and scanned a 7 × 7 square of saturation flags. The loop now steps along each output row from two transformed points, as the bilinear path already does, and finds saturated sites from a row-dilated mask: one column of 7 reads instead of 49, and none when no site is saturated. The demosaic itself is unchanged (capture AHD stays exact, #399).
  - **Same bytes:** samples, RAW and the highlight counts are identical (SHA-256) on a 24 MP Siemens star frame and on 2048² regions of Siemens star and dead leaves at seven exposures, from no clipped pixel through 144,548 and 3.6 million to all of them. A new test checks the saturated-pixel count against a 7 × 7 brute-force count from the RAW on frames where none, some or all pixels clip; reducing the reach by one site fails it.
  - **Measured** in Node, one thread, the 2.8.0 record's request (24 MP full frame, 6 µm, 50 mm f/8, 2 × 2 box, ISO 100) with `output.demosaic: "ahd"`, before and after interleaved: development of a 2048² Siemens star region 3.39–3.57 s → 2.32–2.35 s at 1/125 s (three runs); the whole frame 33.6 s → 28.5 s, development 18.0 s → 12.4 s with the demosaic at 10.1–10.3 s (one run).

- **Captures of chart and material scenes: the sensor stage allocates less per site (#418).**
  - **What changed:** the tabulated RAW path's sensor stage reseeds its charge and read-noise streams in place for each site instead of creating two new streams, sums the read-noise components in one loop instead of a mapped array, and returns each site's record without a second copy. The seeds, every draw and every addition are the same, in the same order.
  - **Same bytes:** RAW codes and samples are identical (SHA-256) on a 24 MP Siemens star and a dead-leaves frame; the bit-identity hash locks and the tabulated-path tests pass. A new test checks that a reseeded stream draws what a new one does for 137 seeds, including the fallback-state seed.
  - **Measured** in Node, one thread, the 2.8.0 record's request (24 MP full frame, 6 µm, 50 mm f/8, 2 × 2 box, ISO 100), built `dist`, before and after interleaved on the same host: RAW stage of a 2048 × 2048 centre region 3.21–3.24 s → 2.74–2.78 s (Siemens star) and 3.27–3.36 s → 2.80–2.89 s (dead leaves), three runs each; the whole frame 18.5 s → 16.4 s (RAW 15.5 s → 13.3 s), one run.

- **Display view parts: request tables kept across renders of a prepared view; bands sized to the part.**
  - **Kept tables:** a prepared view's renders share its expected-signal tables (lattice groups, combined kernels, each material's uniform sum) and its lattice material rings, instead of rebuilding them per render. They depend only on the request, and a ring entry only on its lattice point, so concurrent renders may share them.
  - **Band width:** a filled band is built as wide as the part's windows span, not the sensor's full width.
  - **Same values:** a hash of 24 of the Photivra app's Quality and Speed parts (samples, diagnostics and assumptions) is unchanged; concurrent renders of a Quality chart view equal separate calls.
  - **Measured:** a 1 × 1 render of the app's Quality view took 37 ms, of which 21 ms was tables and 10 ms the full-width band. The app's 48 × 48 Quality parts take 94–112 µs per display pixel instead of 115–130 µs (Node, one thread). In the app's Chromium preview (four workers), Quality becomes fully sharp in 65 s instead of 85 s, and in 71 s instead of 97 s after an f-number change; Speed is unchanged.

- **Display view refinement of chart scenes: taller lattice bands and a cheaper `sceneLookups` count.**
  - **Taller bands:** a filled window's band of lattice materials and change counts is built twice as tall (when it uses the lattice ring), so the next display rows' windows reuse its columns instead of rebuilding a full-width band per display row. A lattice point's material, and the number of material changes inside a rectangle, do not depend on the band's origin, so every value is the same.
  - **`sceneLookups` count:** the lookups a window's lazy cache would have made are counted from a bit mask per window row (a union of dilations is the dilation of the union) instead of marking and box-filtering the whole window per lattice group. Same count: checked against the previous method on every window of the measured band; the diagnostics are part of the display-view hash locks.
  - **Measured** in Node, one thread, the Photivra app's 24 MP request with its maker-label chart: one Quality refinement band (2028 × 32 of a 2028 × 1352 view) 6.1 s → 4.1 s, with the same result hash; Speed unchanged within run-to-run variation.

- **Display view of chart and caller material scenes: lattice materials kept across refinement windows; caller scene points no longer frozen.**
  - **Lattice rows kept:** at device-pixel sizes each display pixel's window spans its footprint (about 3 real pixels) plus the demosaic reach and kernel radius, so successive display rows re-read most lattice points. Each lattice group now keeps up to 128 rows of looked-up material indices (Int16 where they fit, about 3 MB for four groups of a 6000-site row) across the filled windows of a render; a material is a function of its lattice point alone, so the values are the same.
  - **Points not frozen:** caller `materialAt` and `evaluate` callbacks receive a new plain point object per call, which the engine does not read afterwards. `Object.freeze` on it took about 40 % of a chart lookup (268 → 160 ns in a micro-benchmark). The point was never documented as frozen; mutating it affects nothing.
  - **Same values:** all display-view hash locks and tests pass.
  - **Measured** in Node, one thread, the Photivra app's 24 MP request with its maker-label chart (with the app's own label-mask speed-ups): Quality 96 × 64 coarse frame at 4 × 4 samples 42.9 s → 30.2 s; one Quality refinement band (2028 × 32 of a 2028 × 1352 view) 10.1 s → 6.3 s.

### Faster, values within rounding

- **Diffraction kernels of large cells in real space from β = 32 (was 192).** The frequency-domain cell integration costs grow as β² (β = cell side × cut-off frequency); whole-frame and binned views of the app's Quality preset sit at β ≈ 60–190, where it took seconds per new f-number.
  - **What changed:** the real-space encircled-energy integration of 2.5 now runs from β = 32. Below x = 300 it evaluates J₀² + J₁² by Miller's backward recurrence, normalized by J₀ + 2ΣJ₂ₖ = 1 (DLMF §3.6(iii), 10.12.4; free); from 300 by the Hankel expansion as before.
  - **Values:** at β = 32–191 (radius 1–8) the real-space cells agree with the frequency-domain cells within 5.5e-13 (cell energies sum to 1) and change by under 1e-17 when the panel counts double; J₀² + J₁² matches Bessel's integral within 1e-11 relative at x = 0.5–12 346. Every native pitch up to 10 µm (β < 19) keeps the frequency-domain cells, so captures at sensor pitch are unchanged; binned and whole-frame views at β ≥ 32 change in the last bits. No capture hash lock changed. `quadrature.method` reports the real-space method for those wavelengths.
  - **Measured** in Node, one thread, the app's 48-pixel Quality quick frame of a 24 MP full-frame sensor on a fresh process: 3.99 s → 0.62 s (the profile's cell integration was 3.4 s). Over the nine f-stops of the 50 mm lens, fresh each: 14.0 s → 4.4 s in all, slowest stop 3.65 s → 0.90 s. Per cell: radius 4, β = 160: 2.4 s → 12 ms; radius 8, β = 191: 19.5 s → 81 ms.

## 2.8.1 — published October 25, 2026

A patch release: the same results as 2.8.0, faster. It fixes a 2.8.0 slowdown before a chart or material capture's first RAW tile and writes JPEGs about 3× faster.
- **Captures:** a 768-pixel Quality capture takes 5.6 s instead of 23.4 s on 2.8.0 (796 s on 2.7.0), and the slowest first tile measured takes 2.2 s instead of 24 s (Node, one thread).
- **JPEG:** a 24 MP JPEG is written in 5.0 s instead of 15.2 s, with byte-identical files.
- **No API change:** root exports are unchanged; results are the bytes of 2.8.0.

### Faster, same output

- **JPEG writing about 3× faster, the same bytes.** A 24 MP baseline JPEG took 15.2 s to write and now takes 5.0 s (Node, one thread); every file is byte-identical.
  - **1:1 Print JPEG:** where the output size equals the crop, each output pixel is one source pixel with weight exactly 1, so its sample is a function of its 8-bit code alone; `createPrintJpegTask` now takes it from a 256-entry table instead of the area-average accumulation.
  - **DCT:** the encoder computes the eight v coefficients of a column in one pass over the block. Each coefficient still adds the same IEEE products in the same order and is scaled in the same order, so the coefficients are identical.
  - **Checked:** identical SHA-256 of the files against 2.8.0 for 6000 × 4000, 1001 × 757, 9 × 7, 256 × 32 and 1543 × 1 images (smooth and noise); all JPEG hash locks pass.

- **Captures of chart and material scenes: a short start again (fixes a 2.8.0 slowdown before the first RAW tile).**
  - **Cause:** the tabulated path's four verification sites ran the full chain through the diffraction convolution windowed to the whole render, so its first band convolved the full width before any tile: 24 s for a Quality preview of the 5.6 mm phone sensor at 768 pixels and f/32, against 0.55 s on 2.7.0.
  - **What changed:**
    - the verification uses a convolution windowed to its own 2 × 2 block, whose values are bit-identical to the whole render's (the window contract of 2.6);
    - the whole-render convolution is built only when the environment path runs;
    - the per-channel spectral responses are planned once per channel and kept across calls with the same sensor, exposure and optics;
    - one wavelength's diffraction kernel is resolved once per PSF record, shared by the convolution and the tabulated signal.
  - **Same values:** a capture with warm caches, after another request, equals the same capture from a fresh start (new test); all hash locks pass.
  - **Measured** in Node, one thread, the app's requests tiled as the app renders them (24 MP full frame, f/8, unless noted), 2.8.0 → this change (2.7.0 for reference):

    | Request | 2.7.0 | 2.8.0 | Now |
    | --- | --- | --- | --- |
    | 48-pixel quick frame, Speed / Quality | 1.3 / 8.3 s | 0.87 / 5.5 s | 0.70 / 4.6 s |
    | 384-pixel capture, Speed / Quality | 43.9 / 193 s | 3.0 / 9.3 s | 1.1 / 2.4 s |
    | 768-pixel capture, Speed / Quality | 185 / 796 s | 11.5 / 23.4 s | 3.3 / 5.6 s |
    | 384-pixel Quality capture, 5.6 mm phone sensor, f/32 | 267 s | 25.4 s | 3.9 s |

    The 768-pixel Quality preview of that phone sensor at f/32 reaches its first RAW tile in 2.2 s (0.89 s on a repeated call) instead of 24 s.

## 2.8.0 — published October 25, 2026

A minor release that makes full-resolution captures of chart and material scenes about 50× faster (48–84× in the regions measured), and makes the display view exact at device-pixel sizes.
- **Faster captures, same bytes:** for chart presets and caller material scenes with a still, rectilinear camera, the RAW stage takes tabulated expected electrons and skips the per-site record pipeline. On every request tested, the samples, RAW codes and files are the bytes of 2.7.0.
- **Exact display view at device-pixel sizes:** a display pixel covering at most 25 real pixels is the exact area mean of the real pixels instead of a stratified estimate. Those views have new values (a deliberate reference change); the 155-case validation is the same as 2.6.0's or better.
- **Visible changes:** chart and material captures report a `raw.expectedSignal` assumption and count far fewer `providerEvaluationCount` evaluations; auto white balance no longer renders the RAW twice. Root exports are unchanged (1,727).
- **Known limit:** the Quality noise limit of 2.6.0 remains (#379), and its fix moves to 2.9.0.

Measured on one thread (24 MP frame, 6 µm, 50 mm f/8, 2 × 2 pixel averaging), with identical samples: a 512 × 512 Siemens star region takes 0.6 s instead of 31.7 s on 2.7.0 (Quality options: 2.8 s instead of 135 s); the whole frame takes 28.2 s as sRGB and 36.5 s as a JPEG.

### Faster, same output

- **Captures of chart and material scenes: tabulated expected electrons, 10–13× faster again; the same bytes on every frame tested (#394, step 2).**
  - **What changes:** a capture of a chart preset or a caller material scene, with a still, rectilinear, distortion-free camera (no rotation, lens projection or distortion, vignetting, pupil sampling or caller PSF), no longer runs each native site through the environment chain. It takes each site's expected photo electrons from the display view's tabulated expected signal: the same sum over the pixel-aperture nodes, anti-aliasing spots, diffraction taps and spectral nodes, formed in another order. The sensor stage is the native one, with each site's own seeds: dark charge, both Poisson draws, read noise and the ADC.
  - **Same result, by verification:** one site of each CFA phase still runs the full chain. Its readout must be reproduced bit for bit, and its tabulated electrons must agree with the chain's within 1e-9 relative; otherwise the capture takes the environment path. Electrons that differ in the last bit could, rarely, draw a different integer at a site; on every frame tested none did.
  - **Measured equality:** 0 differing RAW codes and 0 differing samples:
    - 1,052,676 native sites of a 24 MP frame in Speed, for dead leaves and for a material scene;
    - 272,484 sites with the Quality options;
    - every frame of the 2.0.0 hash locks.

    The verification sites agreed within 2 × 10⁻¹⁵ relative.
  - **Visible changes:**
    - a `raw.expectedSignal` assumption names the method and the verification;
    - `diagnostics.providerEvaluationCount` counts the verification sites' evaluator calls and the table's scene lookups (120 instead of 720 for a 6 × 6 frame);
    - auto white balance keeps the RAW instead of rendering it again, because its codes do not depend on the white-balance intent.

    The 2.0.0 hash lock's byte digests are unchanged; its assumption and diagnostics digests were re-recorded.
  - **Measured** on a 512 × 512 centre region of a 24 MP frame (6 µm, 50 mm f/8, 2 × 2 pixel averaging), one thread, one run each, against main with step 1:

    | Scene | Speed | Quality options |
    | --- | --- | --- |
    | Siemens star preset | 6.5 → 0.6 s | 37.5 → 2.8 s |
    | Siemens star as a caller material scene | 7.1 → 0.7 s | 40.4 → 3.0 s |

    The whole 24 MP frame on one thread now takes 28.2 s as sRGB (RAW 24.2 s, development 3.9 s), 36.5 s as a JPEG (encoding 11.2 s) and 75.7 s as a Quality PNG.
  - **Code:**
    - the expected signal moved to `src/facade/expected-signal.ts`, so capture-only bundles still leave out the display view;
    - the input setup is shared with the display view in `src/facade/expected-signal-setup.ts`, and the display view's hash locks are unchanged;
    - the RAW task is in `src/capture/native-environment-tabulated.ts`.

- **Captures of chart and material scenes: 3.6–8.3× faster RAW stage, no byte changed (#394, step 1).**
  - **Engine-built tiles without a private copy:** the native environment no longer `structuredClone`s the site records that `simulateCapture` builds for each tile. They are fresh engine records, never shown to supplied code or changed afterwards, so they are planned as engine-owned data directly. Shared records keep their identity, which also makes the template comparisons cheaper. Tiles from callers are still copied.
  - **Key taps:** for a chart preset or a caller material scene, the engine-built evaluator's result for a query is a pure function of the material at the queried plane point and the wavelength (with object-space diffraction, of the convolved lattice site and the wavelength). A verified lean template now plans its sites' taps as those keys instead of frozen requests, and takes each radiance from the key: chart materials from a table filled once per material and spectral node, lattice sites from the convolved band. Without a PSF a tap's key is the same at every spectral node, so it is found once per spatial node. The evaluator is not called for such taps; the evaluation count is still added, and the abort check still runs.
  - **Verified per template:** a template takes key taps only when its own site's key radiances equal every radiance of its full execution, tap by tap (`Object.is`). Key taps never apply with pupil rays, a lens field mapping, a caller reflectance or radiance function, or a batched provider. A tap that would need the full irradiance function (a non-finite or negative value, or a field throughput outside the fast path) sends its site through the full path before anything is counted. A caller `materialAt` that throws during key planning sends its site to the full path, which throws the same error.
  - **Tests:** a new test compares lean and full captures (samples, diagnostics counts, assumptions) for chart presets and caller material scenes in Speed and Quality, with a fixed-size chart, rotation, two temporal samples, a rolling shutter, vignetting and a region, and checks that key taps ran; and that lens field mappings and caller function scenes stay on request taps. All hash locks and facade fingerprints are unchanged.
  - **Measured** on a 512 × 512 centre region of a 24 MP frame (6 µm, 50 mm f/8, 2 × 2 pixel averaging), one thread, main before and this change after, one run each; samples identical:

    | Scene | Speed | Quality options (diffraction, four-spot filter, AHD) |
    | --- | --- | --- |
    | Siemens star preset | 31.7 → 6.5 s (4.9×) | 135.2 → 37.5 s (3.6×) |
    | Siemens star as a caller material scene | 58.6 → 7.1 s (8.3×) | 252.9 → 40.4 s (6.3×) |

    The material scene gains more because it now also takes the engine-built evaluator's shorter result parsing that chart presets had since 2.6.
- **Display view: a sample's terms written in place; the clock read less often.** Each real pixel's recorded terms went through a new typed-array view (`subarray`, then `fill`) and `Date.now()` was read per display pixel. The terms are now written straight into the real pixel's memo slot (a scratch buffer only for the first sample of a one-material key), and the clock is read every 16 display pixels and at each row's end; yield timing never changes the output.
  - **Same values:** 57 display views (Speed, a 2 × 2 box aperture and the Quality options; three presets, a caller material scene and a caller function scene; exact and stratified sizes) hash identically before and after: samples, expected values, noise and diagnostics. All hash locks pass.
  - **Measured:** four 32-row bands of the app's 2028 × 1352 view of a 24 MP frame (a caller material scene, Speed, 2 × 2 box aperture), one thread, median of five alternating runs: 4.31 s → 4.00 s (about 7 %). A line profile puts the rest of the time in the per-real-pixel statistics and the scene's material lookups (the caller's `materialAt` with the frozen point it receives), which these changes leave as they are.

### Changed

- **Display view: the exact area mean where a footprint holds at most 25 real pixels (#393).** This is a deliberate reference change.
  - **Before:** each display pixel's expected value was a stratified estimate over K × K jittered real pixels.
  - **Now:** where a display pixel's rectangle holds at most 25 real pixels (and at most `view.samplesPerAxis`²), so views at least 1/5 of the frame's width, every real pixel it touches is evaluated once and weighted by its exact overlap, w_j / A. The expected value is then the definition itself, D_P = Σ_j (w_j/A)·E[L_j], with no sampling error.
  - **Noise:** the linear part keeps the closed-form B_c. The independent residual becomes Σ_j (w_j/A)²·r_j, the same model written exactly.
  - **Shared terms:** a real pixel's recorded terms are shared by the display pixels that touch it, in a ring of native rows.
  - **Unchanged:** coarser views keep the stratified estimator and their bytes. The `view.estimation` assumption names the method, and the internal render result reports it.
  - **Tests:** a new test checks, in Speed and with diffraction, the four-spot filter and AHD, that a half-size and a 2/3-size view of a 48 × 32 frame have exactly the overlap-weighted means of the frame-size view's per-pixel expected values (within 1e-12 relative). Two of the six display-view hash locks and both memo locks were re-recorded (their views take the exact path); the four coarser locks are unchanged.
  - **Measured** on the 2028 × 1352 view's 8-row strips of a 24 MP frame, the app's chart as a material scene, one thread, against 2.7.0:

    | Strip | Speed | Quality options |
    | --- | --- | --- |
    | Rows 660 / 300 / 1000 | 1.04 / 1.01 / 0.97 s → 0.84 / 0.85 / 0.77 s | 2.9 / 3.1 / 2.7 s → 2.3 / 2.8 / 2.3 s |

    Samples fell 3–9× and site evaluations 3–10×. The time fell less, because the 2.7 memos had already made repeated samples cheap: at device-pixel sizes the view now does about one real pixel's work per real pixel.
  - **Why 25:** measured on 8-row strips of a 24 MP view (Siemens star and dead leaves, f/2.8, one thread, one run each), the exact path took the stratified estimator's time within run-to-run spread up to 25 real pixels per display pixel and longer above: 1.1–1.2× at 36, 1.4–1.5× at 64, 1.5–2.4× at 144, because it evaluates every real pixel while the estimator takes a quarter of its samples per axis where the pilot finds no detail.
  - **Validation:** the 155-case validation was re-run on October 25 (`de77074`, [record](https://github.com/Photivra/photivra/blob/main/docs/validation/display-view-2026-10-25/README.md)): 145 cases are identical to the 2.6.0 record, and the 10 cases on the exact area mean (the phone at 800 wide) are the same or better (Siemens star: expected-value RMS 1.78 → 1.35 codes, SSIM 0.9931 → 0.9966). The known Quality noise miss of case 138 (#379) remains: 1.165 against the 1.15 limit.

### Known limit

- **Quality noise at small footprints (#379), unchanged from 2.6.0.** With `output.demosaic: "ahd"` the display view's noise has too much colour where a display pixel covers few sensor pixels; validation case 138 is outside its limit (1.165 against 1.15). The exact covariance through AHD's two linear candidates was measured and makes it worse (1.351), because AHD's direction choice reacts to the noise; the remaining fix is a Monte Carlo model of the real AHD output's noise covariance, moved to 2.9.0 by the owner's decision of October 25, 2026. Speed (bilinear) is exact, and the Photivra site offers Speed only.

## 2.7.0 — published October 24, 2026

A minor release that makes the display view much faster at device-pixel sizes and adds two APIs for it.
- **API for regions:** `prepareDisplayView` resolves a request once for many regions.
- **API for charts:** caller material scenes let a piecewise-constant scene, such as a chart with a printed label, take the chart path.
- **Faster, same output:** three speed-ups change no byte of any result: the scene illuminant evaluated once per wavelength, a sample's terms reused per real pixel, and site values kept across display pixels.
- **Compatibility:** every request that 2.6.0 accepted gives byte-identical results (the engine version recorded in results aside). Root exports grow from 1,721 to 1,727; none is removed.
- **Known limit:** the Quality noise limit of 2.6.0 remains, and its fix moves to 2.8.0.

Measured on the app's All-in-one chart with its maker label (24 MP frame, the 2028 × 1352 view's centre strip, one thread, Speed), using the material scene: 1.15 s instead of 15 s on 2.6.0. With the Quality options it takes 3.0 s instead of 180 s.

### Added

- **Prepared display view: many regions of one view from one setup (#387).**
  - **The problem:** each `simulateDisplayView` call repeated the request's setup, so a caller rendering one view in many regions (progressive display on several workers, centre first) paid it once per region. The setup is request validation; the camera, lens, scene, chart and illuminant; the channel responses through the environment chain; the diffraction kernels, readout moments, demosaic tables and colour matrix.
  - **The new API:** `prepareDisplayView(options)` resolves the request once and returns a handle. Its `render(view, { signal })` returns what `simulateDisplayView(options, view)` returns, byte for byte: samples, view, exposure, scene, diagnostics and assumptions. Only `diagnostics.timingsMs` differ, and they cover the render only.
  - **Behaviour:** renders may run concurrently and share only read-only setup. Each render has its own expected-signal caches, lookup count and assumptions, and its own abort signal.
  - **Measured** on the app's 24 MP request, one thread, 8 × 8 regions of the 2028 × 1352 view, four in a row:

    | Request | Separate calls | Prepared |
    | --- | --- | --- |
    | Chart preset, defaults | 0.26–0.41 s each | 0.25 s once, then 6–7 ms per region |
    | Caller scene, defaults | 0.24–0.43 s each | 0.21 s once, then 17–42 ms per region |
    | Chart preset, with diffraction, four-spot filter and AHD | 0.73–0.79 s each | 0.69 s once, then 34–66 ms per region |
    | Caller scene, with the same options | 1.27–1.52 s each | 0.73 s once, then 0.68–0.75 s per region (its own diffraction work) |

  - **Exports:** `prepareDisplayView`, `PreparedDisplayView` and `PreparedDisplayViewRenderOptions`; root exports grow from 1,721 to 1,724. A test renders whole views and regions through a prepared view, concurrently too, for Speed, Quality and a caller scene, and compares them with separate calls. See the quick start, "Display view".

- **Caller material scenes (#386).**
  - **The new scene form:** `{ kind: "material-function", sceneId, materials, materialAt }` is a third caller scene form. It is for piecewise-constant scenes such as a chart with a printed label. `materials` lists reflectances as chart patches take them: neutral numbers or reflectance spectra covering 380–780 nm, at most `CALLER_MATERIAL_SCENE_MAX_MATERIALS` (65,536). `materialAt` receives the plane point without a wavelength (`SceneMaterialPoint`: `xM`, `yM`, `u`, `v`, and `chartU`, `chartV` on a fixed-size chart) and returns a material index. An index outside the list is an `InvalidConfigurationError`.
  - **Captures and ideal references:** the radiance at a point is the material's, in the chart's expression order, so they are byte-identical to the same scene as a reflectance function. Tested in Speed and with diffraction and AHD.
  - **Display view:** it takes the chart presets' material path, with each material tabulated once per spectral node and one lookup per lattice point. A material scene that reproduces a preset gives the preset's bytes, expected values and lookup count. Against the reflectance-function form, the same quantities are summed in another order:
    - expected values agree within 1e-12 relative (tested);
    - on whole views of the app's chart with its maker label (24 MP frame, Speed), 0 of 523,776 samples differ at 512 × 341 and 0 of 2,281,248 at 1068 × 712, with the largest |Δ| in the expected linear values 3.7 × 10⁻¹⁵.
  - **Scene digest:** the materials enter `scene.sourceSha256`. The `materialAt` body does not, as for the other caller functions.
  - **Measured** on the 2028 × 1352 view's centre strip, one thread:

    | App's chart with its maker label | Reflectance function | Material scene | Chart preset (no label) |
    | --- | --- | --- | --- |
    | Defaults | 3.2 s | 1.15 s | 1.1 s |
    | Diffraction, four-spot filter, AHD | 111 s | 3.0 s | 2.6 s |

  - **Exports:** `CallerMaterialScene`, `SceneMaterialPoint` and `CALLER_MATERIAL_SCENE_MAX_MATERIALS`; root exports grow from 1,724 to 1,727. See the quick start, "Piecewise-constant scenes (2.7)".

### Changed

- **Display view without diffraction: site values are kept across neighbouring display pixels (#392).**
  - **What changed:** each display pixel opens a cache window of its footprint plus the demosaic reach. Neighbouring windows overlap, so the same native sites were evaluated about 3.7 times (measured at 2028 wide on a 24 MP frame). Without diffraction the view now keeps site values in a ring of native rows, a power of two at least twice the window's height, as the filled chart path already did with diffraction.
  - **Exactness:** a site's value does not depend on the window, and a ring hit adds to `sceneLookups` the lookups the site's evaluation would have made. So samples, expected values, noise and every diagnostic are unchanged. The hash locks and the same 120 views as above hash identically.
  - **Measured** on the same strip, Speed (one thread):

    | Request | Before (after the memo above) | After |
    | --- | --- | --- |
    | Caller `reflectance-function` scene | 12.5 / 13.4 s | 3.0 / 3.0 s (4.3×) |
    | Chart preset | 1.2 / 1.3 s | 1.0 / 1.0 s |

    With the illuminant table, the memo and this change together, the caller-scene strip takes 3.1–3.6 s instead of 14.0–15.2 s on 2.6.0, and the chart preset 1.0 s instead of 2.1–2.5 s.

- **Display view: a sample's terms are reused for later samples of the same real pixel (#392).**
  - **What changed:** at device-pixel view sizes a display pixel covers a few real pixels, and its 256 samples land on each of them many times. A sample's recorded terms depend only on its real pixel, not on the display pixel or the sample: the site variances, candidate slopes, residuals, expected values, the AHD choice terms and the correction. The view now keeps them per real pixel of the display pixel's footprint and replays them for later samples, as the one-material memo already did.
  - **Exactness:** the replay adds the same values to the same sums in the same order. It is used only where every site of the sample lies in the window's site cache, where reading the sites again cost no work and no scene lookup. So samples, expected values, noise and diagnostics, `sceneLookups` and `siteEvaluations` included, are unchanged:
    - the six hash locks, and two new locks for views barely smaller than the frame, recorded on 2.6.0 before the change;
    - 120 further views hashed identically before and after (6, 3.76 and 1.4 µm; five charts and a caller scene; Speed and Quality; 20–90 % of the frame width; ISO 100 and 3200).
  - **Measured** on the same strip as above (one thread, before and after on the same build otherwise):

    | Request | Before | After |
    | --- | --- | --- |
    | Chart preset, defaults | 2.1 / 2.2 s | 1.2 / 1.3 s (1.8×) |
    | Chart preset, with diffraction, four-spot filter and AHD | 7.7 / 7.6 s | 3.0 / 2.9 s (2.6×) |
    | Caller `reflectance-function` scene, defaults | 14.0 / 14.6 s | 12.5 / 13.4 s (1.1×) |
    | Same, with diffraction, four-spot filter and AHD | 185 s | 174 s (1.06×) |

    Caller scenes gain little because their time goes on evaluating each site the first time; reusing site values across neighbouring display pixels is the next step of #392.

- **Scene illuminant evaluated once per wavelength (#385).**
  - **What changed:** the planar scene provider (chart and caller scenes, in captures and display views) and the batched chart radiance used to evaluate the illuminant's spectrum on every scene lookup. That is Planck's law, CIE A or the daylight locus: two transcendental evaluations per call. They now keep it in a table per distinct wavelength, filled with the same call.
  - **Results are unchanged:** a prepared spectrum is a pure function of the wavelength, so the table returns the same double and the product keeps its order, `value × irradianceScale × shape / π`. Display views, captures, hash locks and fingerprints are byte-identical. The table lives in each provider (one per call), up to 4,096 wavelengths.
  - **Measured** on a 24 MP full frame (6000 × 4000 at 6 µm), f/8, a composite chart with a 2 × 2 box, on the 2028 × 1352 view's 8-row centre strip. One thread, 4-vCPU Linux container, Node 24.21.0, two runs each, same sample hashes before and after:

    | Request | Before | After |
    | --- | --- | --- |
    | Caller `reflectance-function` scene, defaults | 15.0 / 15.2 s | 8.8 / 8.5 s (1.75×) |
    | Same, with diffraction, four-spot filter and AHD | 185 / 174 s | 113 / 116 s (1.56×) |
    | Chart preset, defaults | 2.2 / 2.5 s | 2.2 / 2.0 s |
    | Chart preset, with diffraction, four-spot filter and AHD | 7.9 / 8.9 s | 7.4 / 7.6 s |
    | 128 × 128 capture region, caller scene / chart | 4.9 / 3.2 s | 4.7 / 3.0 s |

### Known limit

- **Display view, Quality (AHD): too much colour in the noise where a display pixel covers few sensor pixels (#379).** This is unchanged from 2.6.0 (see its entry below). By the owner's decision of October 24, 2026 ("Ship speed now, #379 in 2.8.0"), the redesign of the Quality noise model moves to 2.8.0. Speed (bilinear) is exact.

## 2.6.0 — published October 20, 2026

A minor release that adds the display view and the close-up light factor and makes Quality renders faster. `simulateDisplayView` gives the image the real full-resolution capture would give after resizing to a display size, without rendering it at full resolution; region renders with diffraction convolve only the region, identical diffraction kernels are reused and built faster, the engine's own chart scenes skip re-parsing their fixed records, and the framing results report how much light the lens loses up close. Applications that only capture do not bundle the display view. Every capture and ideal-reference request that 2.5.0 accepted gives byte-identical results (the engine version recorded in captures aside), except that region renders with diffraction state the narrower convolution in their `output.region` assumption; their samples, RAW codes and files are unchanged. `calculateChartFraming` and `calculateSubjectDistanceForFraming` results gain two fields. Root exports grow from 1,717 to 1,721 symbols; none is removed. The display view with the Quality options has one known limit, listed below.

### Added

- **Display view: the real full-resolution capture resized for display (#368).** `simulateDisplayView(options, view)` takes a `simulateCapture` request (the real sensor's pixel count and pitch) and a display size, and returns the image that capture would give after area averaging in linear light to `view.width` × `view.height`, without rendering it at full resolution. Optics (diffraction, the anti-aliasing filter, the pixel aperture) act at the real pitch, the colour mosaic and demosaic are the real pixels', the noise is that of the average of the real pixels (demosaic correlation included), and exposure, white balance and tone are the capture's. The expected value is a seeded stratified Monte Carlo average over real pixels with exact real-site expectations; the clips and tone curve act on each pixel's own noise distribution (normal, with a first-order Edgeworth skewness term); the noise is one correlated normal draw with the variance of the area mean; AHD is represented by its two linear candidates plus a control-variate correction where its choice reacts to noise. Validated against real full-resolution region renders resized in linear light (three sensors, five charts, f/2.8–f/16, ISO 100–6400, 96–800 pixels wide, Speed and Quality; `docs/DISPLAY_VIEW.md`). Cost follows the detailed display pixels: with the engine defaults 0.6–2.4× the 2.5 whole-frame view of the same request (0.87–1.3× for a Siemens star at 384 pixels wide on 24, 12 and 100 MP sensors). With the Quality options it is 0.76–1.6× on a 6 µm sensor, 1.0–3.7× at 3.76 µm and 2.2–20× at 1.4 µm, from real-pitch diffraction and the AHD correction (one run each, 4-vCPU Xeon; `docs/DISPLAY_VIEW.md`, "Cost"). New `SimulateDisplayViewOptions`, `DisplayViewResult` and `SIMULATE_DISPLAY_VIEW_DEFAULT_SAMPLES_PER_AXIS`; repository scripts `validate-display-view.mjs` and `benchmark-display-view.mjs`. The result is labelled `kind: "display-view"` and is not a capture. Root exports grow from 1,717 to 1,721 symbols; none is removed. Every existing request, result, hash lock and fingerprint is unchanged, including the whole-frame views.
- **Close-up light factor as data (#364).** `calculateChartFraming` and `calculateSubjectDistanceForFraming` results gain `closeUpTransmission`, the thin-lens factor 1/(1 + m)² (m = v/s at the focus distance) by which the image-plane irradiance falls compared with infinity focus, and `closeUpLossStops`, 2·log₂(1 + m). Both come from the working f-number factor the scene-to-sensor irradiance applies (one internal function), so applications no longer compute it; a test checks them against the RAW signal ratio of `simulateCapture` between 0.35 m and 50 m within 0.5 %. Additive fields; no new exports (see the quick start's "Close-up light (2.6)").

### Changed

- **Region renders limit the diffraction convolution to the region (#354).** With `output.region` and `lens.diffraction`, the object-space convolution now covers only the scene lattice the region's native sites query (the native rectangle plus the anti-aliasing and box-aperture offsets, with the kernel radius of real scene radiance around it) instead of whole-width bands. Every kept value is the same gather with the same kernel, taps and order, so regions stay byte-identical to the same pixels of the whole render and to 2.5.0. A 192 × 128 crop of a 6000 × 4000 frame at 6 µm and f/16 with diffraction, the four-spot filter, AHD and a 2 × 2 box aperture took 39.6 s instead of 228.7 s (the convolution 6.5 s instead of 195.8 s; peak memory 545 MB instead of 1 285 MB); without the box 11.8 s instead of 60.8 s (on a GitHub-hosted 4-vCPU runner: 27.7 s instead of 170.9 s with the box, 8.3 s instead of 44.1 s without). The rest of the time is the per-site work, which follows the region's sites and scene queries. Region results with diffraction say so in the `output.region` assumption; region results without it keep the 2.5.0 text. Tested byte for byte against whole-frame crops (centre, corners, edges, 1-pixel strips and the full frame) at 2–250 µm and f/4–f/16 with the Quality options (see the quick start's "Region rendering").
- **Diffraction kernels are reused and built faster (#355).** `createDiffractionLimitedPsfProfile` (and so `lens.diffraction`) keeps the 256 most recently used Airy cell tables, keyed by β = pitch/(λ·N_w) and the kernel radius, and hands out copies; the frequency-domain quadrature takes cos θ and sin θ from a table computed with the same expressions. The values are unchanged (cell bytes locked against 2.5.0 at β = 0.4–250). A second build of the same profile in the same JavaScript realm (another tile of the frame in the same worker, or a capture that changes only the exposure, ISO, scene or output) takes milliseconds: 1–4 ms instead of 0.3–1.5 s at 375–912.5 µm, f/16, 20 wavelengths. A first build takes 15–30 % less (750 µm: 1.37 s instead of 1.63 s). On a GitHub-hosted 4-vCPU runner, a repeated whole-frame Quality capture (diffraction, four-spot filter, AHD, f/16) at 48 × 32 took 0.76 s instead of 1.66 s for a full-frame sensor and 0.67 s instead of 1.96 s for medium format; at 96 × 64 with the 2 × 2 box, where the per-site work dominates, 6.47 s instead of 6.79 s and 6.54 s instead of 6.99 s. The β ≥ 192 switch to the real-space method stays where it is: its Hankel expansion needs x = π·β/2 ≥ 300, so it cannot go below β = 191 without another Bessel method, whose cells would differ from today's in the last bits.
- **Less validation overhead for the engine's own chart scenes (#363).** In `simulateCapture` with a chart preset, the native environment no longer re-parses the fixed parts of each scene result: it skips the unknown-key scan and the re-parse of the deep-frozen uncertainty, evidence and limitations records when they are the same objects as an earlier result's that passed the full parse. Every scalar check (shape, schema, quantity, unit, status, identifiers, wavelength, basis, radiance) still runs. Caller scenes and caller providers keep the full validation. On a GitHub-hosted 4-vCPU runner a 192 × 128 Quality crop (diffraction, four-spot filter, AHD, 2 × 2 box) of a 6000 × 4000 frame took 19.4 s instead of 29.3 s, and a 96 × 64 whole-frame Quality capture 4.9 s instead of 7.5 s (median of three).
- **Display view Quality is 2–5× faster, byte for byte (#375).** Two exact speed-ups, with every display view unchanged (samples, expected values, noise and diagnostics, `sceneLookups` included): the AHD correction states are kept and shared across display pixels and across calls with the same noise seed, readout and development (packed, at most 65 536 states for each of the 4 most recent input sets, about 50 bytes each), and are 3× cheaper to compute (a table of ln n! with the same partial sums, per-mean Poisson constants, the AHD steps on flat arrays); and the per-site diffraction sums keep their order but are shared: lattice materials are looked up once per display row, a site whose kernel reads one material takes that material's precomputed sum, and site values carry over between neighbouring display pixels. Samples whose sites all read one material replay the recorded terms of the first such sample, and zero-weight terms are skipped. On a 4-vCPU Xeon (Siemens star, f/8, ISO 100, before and after interleaved, one run each), the 12 MP phone at 1.4 µm took 49.7 s instead of 222 s at 96 pixels wide, 106 s instead of 450 s at 384 and 272 s instead of 837 s at 800; 100 MP medium format 18.2 / 49.7 / 126 s instead of 64.9 / 208 / 424 s; 24 MP full frame 5.2 / 30.9 / 84.3 s instead of 15.5 / 65.0 / 162 s; dead leaves at 384 wide 1.8–4.1× faster. Speed is unchanged. The phone at 384 wide stays above the 60 s aimed for: its remaining time is the correction states' draws (40 s), the per-sample statistics (42 s) and the kernel sums (13 s), which cannot be cut further without approximation or parallel workers (`docs/DISPLAY_VIEW.md`, "Cost"). A second view with the same sensor, exposure and development reuses the states (the same phone view again: 73 s). Proof: all 155 validation requests at their seeds hash identically before and after, a new test locks six requests covering each path to hashes recorded before the change, and the capture hash locks and facade fingerprints are unchanged.
- **Display view: the same bytes on every Node.js version (#376).** The display view's own arithmetic no longer uses `Math.pow`, `**`, `Math.exp`, `Math.log`, `Math.cbrt` or `Math.cos`, whose last bits ECMAScript leaves to each engine (Node 22 and Node 24 differ in about 10 % of `x ** (1/2.4)`). It uses new internal portable functions (`src/core/portable-math.ts`: logarithm, exponential, power, cube root, e^x − 1, cos and sin of 2πu), each a fixed sequence of correctly rounded operations within 1 ulp (2 ulps for e^x − 1, cos and sin) of the exact function, by double-double arithmetic and Taylor series after range reduction (Dekker 1971; Muller, *Elementary Functions*, 3rd ed., ch. 11): for the sRGB encoding, the normal density, the Box–Muller and Poisson draws, the AHD correction's CIELAB cube root and grid, the engine's illuminant formulas (Planck's law, CIE A, the daylight locus) with the view's irradiance scale and scene-illuminant white balance, the Planckian locus of a Kelvin white balance, and a step wedge's equal-density levels. The display view's bytes changed once in their last bits and are now the same on Node 22.13, 22 LTS, 24 and 26: the hash locks hold one set instead of one per runtime, and 156 further requests across sensors, options, charts, exposures, illuminants and white balances hashed identically on Node 22.13, 24 and 26. Inputs the view takes from the capture's code (sensor spectral response, colour-matching fit, diffraction kernels, chart geometry) keep `Math`, so in browsers whose `Math` differs (Chromium 141 with diffraction, Chromium 153, JavaScriptCore) its expected values and noise can still differ in the last bits (`docs/DISPLAY_VIEW.md`, "Same bytes in every engine"). The portable functions cost more operations than `Math`; with both values of each Box–Muller pair used and no draws for the 16 sites AHD never reads, Speed is unchanged within run-to-run spread and Quality takes up to about a quarter longer on small pixels (one run each on a 4-vCPU Xeon: phone star at 96 wide 47.5 → 60.2 s, at 384 wide 97.2 → 114.6 s; full frame star at 384 wide 27.0 → 28.2 s). Captures are unchanged: every capture result, hash lock and fingerprint is byte-identical.
- **Faster seeded random streams, same draws (#375).** The engine's xorshift32 stream keeps its state in a `Uint32Array` instead of a closure variable, which halves the cost of a draw (a uint32 above 2^30 was boxed on every step); the draws are unchanged (tested against the previous form for 50 000 values).
- **Bundles that only capture leave out the display view (#381, issue #380).** `simulateDisplayView` moves to its own module, which hands its renderer to the shared request path, and the shared illuminant, white-balance, chart and readout code takes the display view's portable functions as arguments instead of importing them; the portable functions' tables are built by expressions marked pure. A bundler that imports only `simulateCapture` and `simulateIdealReference` now drops the display view and every portable function except the two captures use (rolldown 1.2.9, minified: 779,884 bytes, 208,090 gzip, instead of 820,912 and 224,431; 2.5.0: 774,225 and 205,841), and `calculateChartFraming` alone bundles to 4,708 bytes gzip instead of 5,362 (2.5.0: 4,265). A new test bundles a capture-only consumer with rolldown and checks that the display view is absent. Results are unchanged: the facade fingerprints, every capture and display-view hash lock, and captures, ideal references and display views through each changed path (Planckian, CIE A and daylight illuminants, Kelvin and scene-illuminant white balance, step wedges) hash identically before and after. `rolldown` (MIT, already installed with Vitest) becomes a declared development dependency.

  | Consumer imports (rolldown 1.2.9, minified) | 2.5.0 | before #381 | 2.6.0 |
  | --- | --- | --- | --- |
  | `simulateCapture`, `simulateIdealReference` | 774,225 B / 205,841 B gzip | 820,912 / 224,431 | 779,884 / 208,090 |
  | `calculateChartFraming` | 12,762 / 4,265 | 15,171 / 5,362 | 13,914 / 4,708 |


### Known limit

- **Display view, Quality (AHD): too much colour in the noise where a display pixel covers few sensor pixels (#379).** The noise model treats each output colour as driven only by sensor sites of its own colour, but AHD forms red and blue from green plus interpolated colour differences, so they read green sites as well and share noise with green. Over a large footprint those green weights cancel; over a small one they do not. On the 12 MP 1.4 µm sensor at 800 pixels wide (5 × 5 real pixels per display pixel) the view's R − G noise is about 9 % and its B − G noise 15–18 % larger than the resized capture's. Two validation cases are documented misses of this limit (owner decision, October 20, 2026; limits unchanged): case 138 (uniform 18 % grey, ISO 6400), predicted ÷ reference noise R 1.164, G 1.133, B 1.030 against 0.85–1.15; and case 92 (slanted edge, ISO 100), false colour +0.48 code against the 7-seed reference mean (limit 0.5; +0.49 ± 0.05 over seeds). The expected value is not affected, and Speed (bilinear) is exact. A redesign of the Quality noise model is planned for 2.7.0; see `docs/DISPLAY_VIEW.md`, "Known limit: Quality noise at small footprints".

### Documentation

- **Display-view validation regenerated on the final code, against seven reference noise seeds (#377).** All 155 cases of `scripts/validate-display-view.mjs` were re-run on `main` at `ea6dbe7` and replace the record in `docs/validation/display-view-2026-10-19/` (its lines came from a build a little before the merged display view). Each reference block is now rendered at noise seeds 1–7 and every reference-side metric is the mean over the seven, because one noise realization of the reference varies too much for the limits: on the 100 MP sensor at 800 pixels wide the reference's slanted-edge MTF50 ranged 0.521–0.554 over the seven seeds (standard deviation 2.1 %), so two single realizations differ by about 3 %, the size of the MTF50 limit. The limits are unchanged. Every case passes every limit except one noise ratio, a documented miss of the known limit of the Quality noise model (#379; case 138: 12 MP phone, Quality, uniform 18 % grey, 800 wide, ISO 6400: predicted ÷ reference R 1.164, G 1.133, B 1.030 against 0.85–1.15; limits unchanged); the slanted edge's MTF50 on the 100 MP sensor at 800 wide is −0.9 % (it was −4.4 % against seed 1 alone) and the phone's false colour at 800 wide +0.48 code (limit 0.5). The display views are unchanged.
- **Published sources for the diffraction model (#366).** The quick start's `lens.diffraction` notes and its "Sources" list now cite the scalar Fraunhofer diffraction and Airy pattern model the engine follows: Born & Wolf, *Principles of Optics*, 7th ed., §8.5.2; Goodman, *Introduction to Fourier Optics*, 4th ed., §4.4 and §7.3; Wyant & Creath (1992), §II, eqs. 1–4 (free); MIT OpenCourseWare 2.71, lectures 21–22 (free); the NIST DLMF §10.6(i), 10.17.3, §10.17(iii) and 10.9.2 (free) for the encircled energy and Bessel functions of the real-space path; and Airy (1835) as the original analysis. `docs/PSF_FOUNDATION.md` now cites §7.3 of Goodman's 4th edition for the incoherent transfer function (it said §6.3, the 3rd edition's numbering) and Wyant & Creath for the encircled energy; `docs/PHYSICS_FOUNDATION.md` cites the 2.44·λ·N Airy disk diameter. Documentation only: no code, result, hash lock or fingerprint changes.
- **A source for the one-arcminute print criterion; Goodman section numbers (#378).** The print planner's documentation (`calculatePrintPlan`, `calculatePrintSizeLimit`, `docs/PRINT_PLANNING.md` and the quick start's "Sources") now cites Alomar & Bojikian, "Visual Acuity Testing in Adults" (EyeWiki, American Academy of Ophthalmology, free to read) for the one-arcminute-per-pixel rule of thumb: one arcminute is normal (20/20) acuity under optimal conditions, which some viewers exceed and many do not. It stays labelled an approximate rule of thumb, and the planner still assumes no acuity value. Four comments and docs that cite Goodman's *Introduction to Fourier Optics*, 4th ed., now give that edition's section numbers (checked against the publisher's table of contents): §7.3 for the incoherent transfer function (it said §6.3) and §7.1 for incoherent imaging as a linear system (it said §6.1, which is the thin lens in the 4th edition). Documentation only: no code, result, hash lock or fingerprint changes.

Results are byte-identical to 2.5.0 (the hash locks and the facade fingerprints of 15 default-path results), apart from that assumption text on region renders with diffraction; their samples, RAW and files are unchanged.

## 2.5.0 — published October 18, 2026

A minor release for whole-frame views and chart framing: `simulateCapture` accepts pixel pitches up to 1000 µm, so a whole sensor frame can be rendered at a small output size with the real sensor's prime, minimum focus and framing, and `calculateChartFraming` reports how much of the frame a chart covers at any distance. Both are additive: every request that 2.4.1 accepted gives byte-identical results (the engine version recorded in captures aside). Root exports grow from 1,714 to 1,717 symbols; none is removed.

### Added

- **Whole-frame views at large pixel pitches.** `simulateCapture` `sensor.pixelPitchMicrometers` now accepts 0.5–1000 µm (0.5–100 before). Pitch = sensor width ÷ output width renders the whole frame at a small output size (36 mm at 48 pixels is 750 µm, 44 mm at 48 pixels 917 µm), so `lens.prime` (crop factor, minimum focus), `calculateSubjectDistanceForFraming` and `chartSize` match the real sensor. Above 100 µm the new assumption `sensor.wholeFrameView` records the frame size and states that the noise is that of a binned, downsized view: each pixel's shot noise equals the real photosites in its square summed, while read noise and dark current are applied once per output pixel. Tested at 100–1000 µm: brightness against 6 µm at area ratios up to 27 778 (each CFA channel's RAW mean within half a code, sRGB mean within one, identical saturation), photon transfer at ISO 12 800 within 12 %, diffraction kernels far below a pixel, the four-spot filter, AHD, 2 × 2 and 4 × 4 box apertures, rotation blur and a rolling shutter (each matching the same framing at 1/100 of the pitch), byte-identical region tiles, and a clean `unsupported-float32-domain` from the `webgpu-f32` sensor stage above its 2^24 e⁻ capacity (see the quick start's "Whole-frame views (2.5)").
- **`calculateChartFraming`: chart coverage at any subject distance.** `calculateChartFraming({ sensor, focalLengthMm | equivalentFocalLengthMm, chart, subjectDistanceM, focusDistanceM? })` returns the thin-lens magnification v/d (v at the focus distance, default the subject distance), the framed plane size, the chart's coverage of the frame width and height (above 1 when cropped), its image size in millimetres, the generic prime of that equivalent focal length and the minimum-focus check (`belowMinimumFocus`), with assumptions. It is the framing `simulateCapture` uses: tested equal to `result.scene.chart` with `chartSize` (within 1e-12 relative, including a separate focus distance) and to coverage 1 on the fitted side at `calculateSubjectDistanceForFraming`'s distance. New `CalculateChartFramingInput` and `ChartFraming`. Root exports grow from 1,714 to 1,717 symbols; none is removed.

### Changed

- **Diffraction cells far larger than the Airy pattern are integrated in real space.** `createDiffractionLimitedPsfProfile` (and so `lens.diffraction`) integrates cells with β = pitch/(λ·N_w) ≥ 192 from the Airy encircled energy 1 − J₀² − J₁² (Hankel expansion, DLMF 10.17.3) instead of the frequency-domain quadrature, whose work grows as β²: a 48 × 32 view of a 44 mm frame at f/1.4 with diffraction takes 1.0 s instead of 296 s. Same model; the two methods agree within 2e-12 at β = 192–400. `quadrature.method` gains `"real-space-encircled-energy-gauss-legendre"` and `"frequency-domain-and-real-space"`, with `quadrature.realSpaceWavelengthsNm` listing the real-space wavelengths; profiles below the threshold are unchanged. Every `simulateCapture` pitch up to 100 µm stays below it.

Requests at 0.5–100 µm are byte-identical to 2.4.1 (the hash locks and the facade fingerprints of 15 default-path results).

## 2.4.1 — published October 18, 2026

A republication of 2.4.0. 2.4.0 was tagged and released on GitHub on October 18, 2026 but never reached npm: the Publish npm workflow's verify job hit its 10-minute limit during the coverage gate on both attempts and was cancelled before the publish job ran. 2.4.1 carries the 2.4.0 contents unchanged (caller text metadata in JPEG, PNG and DNG outputs, `output.metadata`, `serializeNativeRawDng` `textMetadata` and `OutputTextMetadata`; see the 2.4.0 entry below) plus the publish-workflow fix. Apart from the engine version that captures record, every request, plan, RAW, image, encoded file and hash lock is byte-identical to 2.4.0, and without `output.metadata` to 2.3.0. Root exports stay at 1,714 symbols; none is added or removed.

### Fixed

- **Publish workflow timeout.** The verify job of `.github/workflows/publish.yml` now has 25 minutes instead of 10 (#346). It took 9m20s for 2.2.1 and 9m33s for 2.3.0; the coverage gate alone takes 8–12 minutes. Repository tooling only: nothing in the published package changes.

## 2.4.0 — tagged; not published to npm (prepared October 18, 2026)

Tagged `v2.4.0` and released on GitHub, but never published to npm because the publish job timed out; use 2.4.1, which carries the same contents.

A minor release for labelling exported files: callers can write their own description, software name, copyright and comment into the JPEG, PNG and DNG files that `simulateCapture` produces (`output.metadata`, also on a PNG `simulateIdealReference`) and into DNGs written directly with `serializeNativeRawDng` (`textMetadata`). It is opt-in: without metadata every request, plan, RAW, image, encoded file and hash lock is byte-identical to 2.3.0 (the engine version recorded in captures aside). Root exports grow from 1,713 to 1,714 symbols (`OutputTextMetadata`); none is removed.

### Added

- **Text metadata in encoded files (`output.metadata`).** `simulateCapture` (and a PNG `simulateIdealReference`) takes an optional `output.metadata: { description?, software?, copyright?, comment? }` and writes the caller's text, unchanged, into the file: JPEG as an XMP `rdf:Description` in the existing APP1 packet (`dc:description`, `xmp:CreatorTool`, `dc:rights`, `exif:UserComment`) plus a COM segment for the comment; PNG as `tEXt` chunks (printable Latin-1) or uncompressed `iTXt` chunks (UTF-8) with the keywords Description, Software, Copyright and Comment before the first IDAT; DNG as an XMP packet in tag 700, with the description appended to ImageDescription after the simulated-RAW statement and a Copyright tag when the text is printable ASCII. The engine adds no text of its own beyond the DNG's existing simulated-RAW statement. Each field is 1–2048 UTF-8 bytes; NUL, lone surrogates, U+FFFE/U+FFFF and control characters other than line feed are rejected with an `InvalidConfigurationError` naming the field. Specifications: ITU-T T.81 §B.2.4.5, Adobe XMP Specification Parts 1–3, W3C PNG Third Edition §11.3.3, TIFF 6.0 (see the quick start's "Text metadata (2.4)").
- **`serializeNativeRawDng` `textMetadata`.** The same fields for direct DNG writing.
- **`OutputTextMetadata`** type. Root exports grow from 1,713 to 1,714 symbols; none is removed.

Defaults are unchanged: without `output.metadata` every request, RAW, image and encoded file is byte-identical to 2.3.0 (new hash locks on the facade's JPEG, PNG, Display P3 PNG, DNG and ideal-reference PNG bytes, recorded on 2.3.0, plus the existing integration locks; like the 2.0.0 lock, the DNG lock writes the Software tag's engine version back to the 2.3.0 name before hashing).

## 2.3.0 — published October 18, 2026

A minor release for building test charts and comparing captures: generic chart elements and a `composite` preset to lay them out, physical chart sizes (`chartSize`) with a framing-distance calculator and a generic prime lens family (`lens.prime`), an opt-in box pixel aperture, byte-identical region rendering for tiles and crops, and ideal reference images without camera effects (`simulateIdealReference`). Everything is opt-in: without the new inputs every request, plan, RAW, image, encoded file, scene digest and hash lock is byte-identical to 2.2.1 (the engine version recorded in captures aside). Root exports grow from 1,680 to 1,713 symbols; none is removed.

### Added

- **Chart elements.** New generic, unbranded chart presets: `dead-leaves` (seeded, scale-invariant r⁻³ radius law after Cao, Guichard and Hornung, drawn front to back until covered), `bar-groups` (three-bar groups at a list of LW/PH frequencies, both orientations, optional engine-drawn seven-segment numerals), `hyperbolic-wedge`, `zone-plate`, `slanted-squares` (an edge field of rotated squares), `line-grid` and `fiducial`, plus `profile: "sine"` on `siemens-star` (the bar profile stays the default and its parameters and digests are unchanged). Continuous patterns are quantized to `CHART_CONTINUOUS_LEVELS` (1024) neutral levels. New analysis helpers `calculateBarGroupTargets` and `calculateSlantedSquareEdges`.
- **`composite` charts.** An ordered list of elements, each a preset in a placement rectangle (frame units) with an optional ellipse mask, over a background preset; later elements cover earlier ones and LW/PH frequencies keep the composite's picture height. Applications build their own layouts from engine parts; branded layouts stay in the application. Caller spectra inside elements enter the scene digest. The `webgpu-f32` chart-radiance stage rejects the new presets, composites and the sine star with `unsupported-on-backend` (documented in docs/WEBGPU.md); `cpu-reference` and `calculateChartRadianceBatch` cover them.
- **Fixed-size chart placement.** `simulateCapture` `chartSize: { widthM, heightM?, surroundReflectance? }` (and the same option on `createPlanarSceneRadianceProvider`) places the chart at its physical size on the plane at the subject distance instead of filling the frame, over a neutral surround (default 18 %). `result.scene.chart` and the assumption `scene.chartSize` report the frame coverage fractions, the thin-lens magnification v/d and the chart's image size; caller scene functions receive chart-local `chartU`, `chartV`. New `ChartSizeOption` and `CHART_SIZE_DEFAULT_SURROUND_REFLECTANCE`.
- **Pixel aperture.** `simulateCapture` `sensor.pixelAperture: "point" | "box" | { kind: "box", samplesPerAxis }` (default `"point"`, the unchanged centre sampling). `"box"` integrates each square photosite (fill factor 1) with an N × N midpoint rule (default 4; the environment's existing spatial quadrature), so whole-frame renders at large effective pitch no longer alias detail finer than a pixel at full contrast. The response |sin(πfp)/(N·sin(πfp/N))| follows the box pixel MTF |sinc(f·p)| within 2.6 % below Nyquist for N = 4; a test measures it on the RAW. It works with `lens.diffraction` on the object-space path (same RAW codes as the per-tap quadrature) and with `sensor.antiAliasing`. Measured cost: 5.2× at 48 × 48 and 7.8× at 128 × 128 for 4 × 4. New `SimulateCapturePixelAperture`, `SIMULATE_CAPTURE_BOX_APERTURE_DEFAULT_SAMPLES` and the cost option `sensor.pixelAperture.box`.
- **Region rendering.** `simulateCapture` `output.region: { x, y, width, height }` renders only that rectangle of the whole `output.width` × `output.height` frame, byte-identical to the same pixels of the whole render: noise seeds, CFA phase and rolling-shutter row timing use absolute native indices of the whole frame, the native rectangle carries the demosaic reach (bilinear 1, AHD 5) and mirror borders apply only at the frame's own edges, and diffraction keeps the whole render's convolution bands. Tests stitch tiles and compare byte for byte across demosaics, border modes, diffraction with anti-aliasing and the box aperture, rotation with a rolling shutter and a fixed-size composite chart. `result.region` reports the rectangle and its native sites; refused with `whiteBalance: "auto"`. New cost option `output.region`. Internally the native RAW task gains a column band next to its row band (no public API change).
- **Ideal reference images.** `simulateIdealReference(options)` renders the same request as `simulateCapture` without camera effects (no lens blur, diffraction, defocus, distortion, vignetting, anti-aliasing filter, mosaic or demosaic, noise, dark signal or motion), with the same scene, framing, chart size, output size, region and pixel sampling, for "compare with the chart" views. Exposure-matched: each channel is the noise-free signal the capture's sensor would record at its resolved exposure, normalized like the RAW development and developed with the capture's white balance, matrices, tone curve and encoding, so uniform patches render at the capture's mean level (tested within one 8-bit code). Labelled `kind: "ideal-reference"`, deterministic, no RAW simulated: 0.44 s for a 768 × 512 composite chart (1.61 s with the box aperture) against 49.3 s for the capture. New `IdealReferenceResult`.
- **Generic prime lenses.** A family of educational primes named by full-frame-equivalent focal length (10–1200 mm, `GENERIC_PRIME_EQUIVALENT_FOCAL_LENGTHS_MM`): focal length = equivalent ÷ diagonal crop factor, widest aperture by class (f/2.8 … f/8), narrowest f/16, f/22 or f/32, marked third-stop f-numbers (`GENERIC_PRIME_THIRD_STOP_F_NUMBERS`), and a thin-lens minimum focus max(0.10 m, f·(1 + 1/0.15)) (`GENERIC_PRIME_MINIMUM_FOCUS`, `calculateGenericPrimeMinimumFocusDistanceM`). Not real products, no brands. `resolveGenericPrimeLens` resolves one for a sensor; `simulateCapture` `lens.prime` uses one and rejects an f-number outside its range or a subject or focus distance below its minimum focus.
- **`calculateSubjectDistanceForFraming`.** The thin-lens distance d = f·(1 + 1/m) that fits a chart (`{ widthM, heightM? }`, as `chartSize`) to the frame (`fit`: contain, width, height or cover), with magnification, coverage, framed size, the prime family's minimum focus and `belowMinimumFocus`. Consistent with the facade's framing: `chartSize` at the returned distance covers the frame exactly. Full-frame A3: 0.127 m at 10 mm, 0.633 m at 50 mm, 2.53 m at 200 mm, 15.2 m at 1200 mm.

## 2.2.1 — published October 18, 2026

A patch release: `simulateCapture` `lens.diffraction` no longer fails for about a third of the combinations of real pixel pitches and f-numbers because of a floating-point rounding error in the kernel-to-site mapping, and the diffraction assumption states when its default window is capped at 32 sites. Captures that 2.2.0 completed are byte-identical (RAW codes, images, kernels and assumption values); only the explanation text of capped windows changes. No root export is added or removed (1,680 symbols).

### Fixed

- **`simulateCapture` `lens.diffraction` failed for about a third of real pixel pitch and f-number combinations.** For pitches such as 3.808864265927978 µm (44 mm / 11 552 px) or 1.6 µm, a capture with `lens.diffraction` threw "Diffraction kernels must sample the site pitch exactly." or "The kernel radius is too small for the PSF support; no tap is dropped.": 182 of the 545 combinations of the app's 109 pitches with f/4, 5.6, 8, 11 and 16 (19, 24, 41, 42 and 56 per f-number). `resolveLensPsfConvolutionKernels` mapped kernel tap n to the site displacement (n·p)/p with the kernel's sample pitch p equal to the site pitch, and that rounded quotient misses n by one unit in the last place for some pitches (3 · 1.6 / 1.6 = 3.0000000000000004). Just below n the tap was split bilinearly, so the kernel was no longer exactly site-sampled; just above n a weight of about 10⁻¹⁶ landed one site outside the window, so the outer ring needed a radius of R + 1. The facade's radius was never too small for the real support. When the two pitches are the same number, the displacement is now the tap offset itself. Captures that 2.2.0 completed are byte-identical (RAW codes, images, kernels and assumption values; 86 of 86 compared at 27 pitches × 5 f-numbers); the other 49 now complete. `resolveLensPsfConvolutionKernels` called directly with equal pitches now reports exact site sampling where it split a tap by such a rounding error. A test sweeps the app's pitches and 200 seeded pitches in 0.5–100 µm at five f-numbers, both through the kernels and through the facade (aborted after the first RAW tile).
- **The diffraction assumption claimed the third dark ring when the window was capped.** The default window is capped at 32 sites; for small pixels at large f-numbers (for example 0.5 µm at f/16, which needs 81) the `lens.diffraction` explanation still said the window reached the third dark ring. It now says the window is capped and how many sites the ring would need; the renormalized tail, already listed per wavelength, is larger there (15 % at 0.5 µm and f/16). The quick start documents the cap. Values, kernels and images are unchanged.

## 2.2.0 — published October 17, 2026

A minor release: opt-in pixel limits for full-resolution images up to 2^27 pixels (about 100 MP sensors) with a measured cost table (#337), and two `simulateCapture` fixes: pixel pitches that failed the aperture fit by a rounding error now work, and image brightness no longer depends on pixel size (#336). Without the new inputs, and at the default 6 µm pitch, every request, plan, RAW, image and encoded file is byte-identical to 2.1.0; at other pitches the brightness fix changes the output by design. Root exports grow from 1,677 to 1,680 symbols; none is removed.

### Added

- **Opt-in limits for full-resolution images up to about 100 MP.** Each full-resolution stage that admitted at most 24 000 000 pixels gains an optional input of the same name as its limit, bounded by a new ceiling of 2^27 = 134 217 728 pixels (16 384 × 8 192), enough for 12 252 × 8 168 (100.07 MP) and 11 552 × 8 664 (100.09 MP) sensors plus their demosaic margin: `maximumPixels` on native RAW (`NATIVE_RAW_LIMITS.ceilingPixels`), native capture SDR, irradiance convolution and temporal exposure sum; `maximumRegionSites` on `simulatePackedSensorRaw`; `maximumQueries` on `calculateChartRadianceBatch`; `maximumPixels` on Print JPEG (new `PRINT_JPEG_LIMITS`) and on `serializePngImage` (default still 100 000 000). Each value must be a safe integer from 1 to the ceiling. A raised native RAW limit is recorded in the plan and raises the native environment whole-event query budget ceiling in proportion (2 000 000 000 per 24 000 000 pixels); a raised Print JPEG limit raises its `maximumEncodedBytes` ceiling the same way (256 000 000 bytes per 24 000 000 pixels) and is recorded in the JPEG's XMP plan. Byte budgets (`maximumOutputBytes` and similar) still apply. New constants `FULL_RESOLUTION_DEFAULT_PIXELS` and `FULL_RESOLUTION_CEILING_PIXELS`.
- **`simulateCapture` `output.maximumPixels`.** Opt-in large captures: the most native sensor sites (output plus demosaic margin) the capture may allocate, up to 2^27. With it `output.width` and `output.height` may reach 16 384 sites including the margin instead of 4094; it is passed to the RAW, development, DNG, PNG and JPEG stages, and lifts the 1 GiB working-memory default of the AHD demosaic (which still admits at most 2^26 sites, checked before any work).
- **Measured cost of large images.** The quick start's new "Large images" section gives the measured time and peak memory per megapixel of each full-resolution stage at 1, 4, 16, 24 and 100 MP in Node (for example 100 MP 8-bit PNG 22.7 s, 1:1 JPEG 69.7 s, RAW development 20.5 s), and `simulateCapture` measured up to 16 MP (about 125 s per MP, 34 bytes per pixel at peak) and extrapolated to 100 MP (about 3.4 h on one core and 3.4 GB). Large sizes are opt-in because they are slow and memory-hungry; browsers may fail to allocate them.

Defaults are unchanged: without the new inputs every request, plan, RAW, image and encoded file is byte-identical to 2.1.0.

### Fixed

- **`simulateCapture` rejected about a quarter of pixel pitches.** For pitches such as 9.287925696594426 µm (36 mm / 3876 px) a capture failed with `INVALID_SCIENTIFIC_INPUT` "Declared geometric sensitive aperture does not fit within the supplied physical imaging area". The facade gives the imaging width as `n · pitch / 1000` mm, and `resolveSensorSamplingAperture` compared it, converted back to micrometres, with the far aperture edge `pitch/2 + (n − 1)·pitch + pitch/2`: the same exact value reached by different rounded operations, which can differ by one unit in the last place. The lattice and aperture fit tests now allow 8 ε (about 1.8 × 10⁻¹⁵) of the imaging extent for rounding; anything larger is still rejected (a 10⁻⁹ µm excess is tested). The lean environment path uses the same allowance. A test sweeps 107 pitches of nine sensor formats at twelve resolutions plus 200 seeded pitches in 0.5–100 µm, at output sizes 32–96 with both border modes and AHD.
- **`simulateCapture` brightness depended on pixel size.** The tier's ISO signal chain and 60 000 e⁻ charge capacity were applied per pixel at every pitch, so the same exposure gave a darker image with smaller pixels (full frame, f/8, 1/125 s, ISO 100, 18 % grey: 8-bit sRGB mean 49.5 at 100 MP, 101.2 at 24 MP, 255 clipped at 1 MP). The facade now scales the conversion gain and saturation signal of every ISO regime with the pixel area relative to 6 µm, following standard output sensitivity S = 10/H (CIPA DC-004-2020 §3.2), which is independent of pixel size, and the photon count μp = A·E·t/(hν) (EMVA 1288 Release 4.0, Eq. 3). Brightness is now 101.2 at every full-frame resolution and per-pixel noise rises as pixels shrink (green standard deviation 0.18 codes at 29.4 µm, 0.93 at 6 µm, 1.83 at 2.9 µm). Read noise and dark current stay per pixel. The charge capacity follows the scaled saturation signal; this keeps the tier's ISO rating and highlight headroom and is labelled as an approximation, not a full-well model (see docs/QUICK_START.md, "ISO and pixel size"). A new assumption `sensor.isoAreaNormalization` records it when the pitch is not 6 µm. At the default 6 µm every output, assumption and hash lock is unchanged.

## 2.1.0 — published October 17, 2026

A minor release: additive, opt-in capture options for diffraction, AHD demosaicing and an optical anti-aliasing filter, per-run cost diagnostics and a measured cost table, and a fix for cancelling captures in Web Workers (#331–#333). Captures that use none of the new options are byte-identical to 2.0.0. Root exports grow from 1,668 to 1,677 symbols; none is removed.

### Added

- **`createDiffractionLimitedPsfProfile`.** A sampled lens PSF profile (`LensSampledPsfProfile`) for an ideal, aberration-free, in-focus lens with a circular pupil: one unit-sum Airy kernel per wavelength on one shared grid. The engine integrates each cell from the circular-pupil OTF, reports the tail energy outside the window per wavelength, and renormalizes. Scalar Fraunhofer approximation; see `docs/PSF_FOUNDATION.md`.
- **`simulateCapture` `lens.diffraction`.** Opt-in diffraction blur at the capture's resolved f-number (`"circular-aperture"`, optional `kernelRadiusSamples`). Stopping down now softens the image: at 128 × 128 the slanted-edge 10–90 % width grows from 1.49 px (no diffraction) to 1.56, 1.69 and 2.73 px at f/4, f/8 and f/16. `result.request.diffraction` holds the profile and how it was applied.
- **`simulateCapture` `sensor.antiAliasing`.** Opt-in optical low-pass (anti-aliasing) filter: a birefringent `"four-spot"` or `"two-spot"` point splitter (default separation one pixel, first MTF zero at Nyquist) or caller `"point-splitting"` components, passed to the engine's existing point-splitting optical-stack kernel. On a 128 × 128 Siemens star at f/8 it halves the false colour (100.8 → 52.2 bilinear, 68.7 → 25.1 AHD) and widens the slanted edge from 1.49 to 2.34 px. It multiplies the scene queries by the number of spots; with `lens.diffraction` the object-space convolution still applies (one convolution per distinct sub-site shift, tested against the per-tap quadrature to 1e-12).
- **`simulateCapture` per-run cost diagnostics.** `diagnostics.options` lists the opt-ins that changed the work of a run (new constant `SIMULATE_CAPTURE_COST_OPTIONS`, type `SimulateCaptureCostOption`), and `diagnostics.timingsMs` gains `diffraction`, `demosaic` and `encode` where those stages ran, so an application can measure each option's cost on the user's device. Additive; timings never enter a digest or output byte.
- **Cost of each `simulateCapture` option** (docs/QUICK_START.md). Measured wall time of every opt-in that affects run time at 48 × 48 and 128 × 128 relative to the default, with method, machine and what each buys: for example anti-aliasing 2.0×, pupil sampling 2 × 8 rays 13×, auto white balance 1.9×, output formats about 1×.
- **`simulateCapture` `output.demosaic: "ahd"`.** Adaptive homogeneity-directed demosaicing (`createAhdDemosaicTask`) in the facade's development, which roughly halves false colour on sharp neutral chart edges.

### Performance

- **Diffraction as an object-space convolution.** For the facade's still, distortion-free planar scene, `lens.diffraction` convolves the scene radiance once per spectral node instead of querying the scene once per PSF tap. It gives the same expected signal as the per-tap environment PSF quadrature (to 1e-12 per site, tested) and takes 0.56 s instead of 13.1 s for a 48 × 48 capture at f/8 (4-vCPU Xeon, Node 24).

### Fixed

- **`simulateCapture` cancellation in Web Workers.** 2.0.0 yielded to the host with `scheduler.yield()` where available. Its continuations run ahead of ordinary queued tasks (WICG Prioritized Task Scheduling, continuation priorities), so a worker's cancel message waited until the whole capture finished. The facade now yields with a `MessageChannel` message, else `setImmediate`, else `setTimeout`; queued tasks, including the caller's abort, run at the next yield, and the 4 ms timer clamp is still avoided (`src/facade/host-yield.ts`). Output is unchanged. Chromium 141 worker, 128 px capture cancelled after 100 ms, three rounds: 2.0.0 ignored the cancel and finished (2.12–2.34 s), now it aborts after one tile and the next 16 px request returns 0.15–0.20 s after the cancel; an uncancelled 128 px capture takes the same time (medians 2.17 s before, 2.16 s after, six alternating rounds).

## 2.0.0 — published October 17, 2026

A major release.

**In short.** 2.0.0 fixes correctness problems found in the first 2.0 review, makes several parts much faster without changing their output, and adds a large set of new features. Some of the fixes change numbers that 1.x produced, change stored identities (hashes and seeds), or reject input that 1.x accepted. Any of those can break existing users, so the version number goes from 1 to 2. Root exports grow from 1,227 to 1,668 symbols, and none is removed.

What it contains:

- the correctness fixes and bit-identical performance work of the first 2.0 review (#270–#288);
- the 2.0 feature streams (#290–#304): sensor gain and fixed-pattern noise, colorimetry, RAW development fixes, optics, rolling shutter and flash, export formats, image processing, the `simulateCapture()` facade (a single simple entry point), and an opt-in WebGPU backend;
- the completion work (#305–#323): the lean native RAW executor and further native RAW speed-ups, the `simulateCapture()` integration, the native RAW DNG writer, the agent guide, free-source citations, strict inputs everywhere, the licence cleanup, and the finished WebGPU backend;
- the licence guard (#324) and the final pre-release review fixes (#325–#328 and this record's update).

See [the 2.0.0 release record](https://github.com/Photivra/photivra/blob/main/docs/RELEASE_2_0_0.md) for the science evidence and the compatibility table.

### Breaking changes

Each item ends with its *Migration* (what an existing user must do). Several items only add new values to a type union. Those break only code that switches over every value of that type (an exhaustive switch).

**Sensor and noise**

- **Noise model `photivra-native-raw-noise` 0.4.0, with independent per-site seeds (#270, #283, #290).**
  - *Why:* the old seed schedule, `seed + 2i`, gave neighbouring pixels a lag-1 noise correlation of about 0.84, so their noise was not independent.
  - *What changed:* per-site charge and read-noise seeds are now `MurmurHash3_x86_32(captureSeed, absoluteNativeIndex, streamId)` (seed schedule `murmur3-capture-seed-native-index-stream-v2`). `createRandom` scrambles its seed with the MurmurHash3 `fmix32` finalizer.
  - *Effect:* every realized RAW code and every recorded seed changes, including direct `simulateSensorChargeRealization`/`simulateSensorRawCode` calls. Result model versions: charge realization **3.0.0**, stochastic RAW code **4.0.0**, expected readout **2.0.0**.
  - *Migration:* results stay deterministic for a given seed at any tile width, but 1.x realizations cannot be reproduced. Captures, plans and replays that carry noise model 0.1.0–0.3.0 are rejected. Re-capture with 2.0.0, and keep old outputs as historical artifacts.
- **ISO now drives sensor gain; generic tier presets 2.0.0 (#290).**
  - *What changed:* readout regimes `base`/`high` are replaced by one regime per ISO, `iso-<S>`, with 12-bit (consumer) or 14-bit ADCs (analog-to-digital converters). `presetVersion: "1.0.0"` is rejected. The producer rejects a regime whose `exposureIndexGain.exposureIndex` differs from `capture.exposure.iso`.
  - *New required result fields:*
    - `SensorChargeRealization` gains `fixedPatternNoiseProfileId`, `photoResponseGainFactor`, `darkCurrentFactor`, `hotPixel`, `photoSampledMeanElectronCount` and `darkSampledMeanElectronCount`.
    - `SensorRawCodeSample` gains `fixedPatternNoiseProfileId`, `fixedPatternReadoutOffsetElectrons`, `adcIntegralNonLinearityOffsetCodes`, `adcCodeBeforeDigitalGain` and `digitalGain`.
    - `SensorExpectedReadoutSignal` gains `adcIntegralNonLinearityOffsetCodes`, `digitalGain` and `expectedCodeAfterDigitalGain`. `expectedDigitalSaturation` now uses the code after digital gain.
  - *Migration:* save selections and optical states with preset 2.0.0, and pick the `iso-<S>` regime that matches the capture ISO.
- **Capacity assessments are bound to their charge (#273, #280).**
  - *What changed:* an assessment must match the charge it is applied to, by exact equality of `totalExpectedStoredElectronCount`, on both readout paths. The stochastic path reports `digitalSaturationApplied` once the code reaches (`>=`) the digital saturation code.
  - *Migration:* compute the assessment from the same charge you pass.

**RAW development and DNG**

- **RAW development output changes (#295).**
  - *What was wrong and is now fixed:* white balance was applied twice with camera matrices that were not white-normalized. Normalization now uses the effective white rather than digital full scale. Clipped highlights stay neutral, and saturation flags are honoured.
  - *DNG output changes:* WhiteLevel, AsShotNeutral, BlackLevel/CFAPattern phase (now relative to the ActiveArea origin) and DNGVersion (now 1.4).
  - *Effect:* `simulationHash` and file hashes change. `diagnostics.captureSaturation` can be `"consumed-in-raw-development"`.
  - *Migration:* re-develop and re-export; update stored hashes.
- **New required RAW fields (#295).**
  - `NativeRawOutput` requires `effectiveSaturationCodes` (one Uint16 per CFA phase).
  - `SensorRawCaptureSample` requires `effectiveSaturationCode`, `systemConversionGainElectronsPerCode` and `readNoiseRmsElectrons`, each constant per CFA phase.
  - *Migration:* hand-built RAW objects must supply them. `calculateEffectiveSaturationCode` computes the first.
- **`createNativeRawDevelopmentTask` takes ownership of `input.raw` (#295).**
  - Its arrays are detached (zero-copy `ArrayBuffer.transfer`, or copied where that is unsupported) and returned in `output.raw`.
  - RAW integrity errors (spans, flags, white levels) now surface from `run()`, not at creation.
  - The provider is now `{ yieldControl, onProgress? }`. A bare function is deprecated but still accepted in 2.x.
  - *Migration:* copy the RAW first if you still need it, and handle integrity errors from `run()`.

**Optics and geometry**

- **Exact thin-lens depth-of-field limits (#271, #279, #293).**
  - *What changed:* `calculateDepthOfField` (and `simulatePocCamera().depthOfField`) now uses the exact thin-lens formulas: near = s(H − f)/(H + s − 2f) and far = s(H − f)/(H − s), with far infinite (`null`) when s ≥ H. (s = focus distance, H = hyperfocal distance, f = focal length.) Model `thin-lens-depth-of-field` 1.1.0.
  - *Example:* for 50 mm at f/8, c 0.03 mm, s 5 m, the limits move from 3.394595/9.486405 m to 3.389371/9.527439 m.
  - It now rejects `circleOfConfusionMm ≥ focalLengthMm/aperture`.
  - `calculateDefocusCircle` uses a numerically stable closed form (model 1.1.0). Values change in the last bits, and more where cancellation used to occur.
  - *Migration:* update stored expectations. There is no option for the old approximation.
- **Camera rotation sign on all three axes, and shake pitch sign (#276, #284).**
  - *What was wrong:* 1.x produced the mirror image on every axis. Rotation mappings now follow the documented right-hand rule about camera +X/+Y/+Z.
  - *Now:* positive yaw gives `deltaMm.x = +d·tan(yaw·t)`; positive pitch gives `deltaMm.y = −d·tan(pitch·t)`; positive roll rotates content counter-clockwise.
  - *Effect:* everything built on the mappings changes with them: trajectories, temporal quadrature, rolling-shutter paths, aperture rays, environment radiance query and capture.
  - `estimateCameraShakeBlur()` keeps its yaw sign, but its pitch `deltaYmm`/`deltaYPixels` flip sign. It rejects a per-axis rotation ≥ π/2 over the exposure.
  - Rotation and stabilization provenance models go to 2.0.0.
  - *Migration:* to reproduce 1.x mappings, negate all three angular-velocity components. To reproduce 1.x shake values, negate the pitch rate.
- **Complex-pupil PSF zero padding and support bound (#276, #284, #293).** (PSF = point-spread function, how the lens spreads a point of light.)
  - *What changed:* `calculateLensComplexPupilPsf()` pads each axis to M = max(grid, 2S − 1). That is the exact condition for no wrap-around (Goodman sampling Q > 2).
  - *Effect:* pupils whose support exceeds (grid + 1)/2 samples get a larger kernel with different values (a full 5×5 disk becomes 9×9).
  - Support wider than `propagationDistanceMm / apertureFNumber` throws `InvalidScientificInputError`. `sampling.declaredPupilDiameterMm` reports that bound.
  - Model 2.0.0; tier envelopes re-baselined.
  - *Migration:* read kernel geometry from the returned kernel, and fix profiles whose support contradicts their f-number.
- **Crop rounding; crop models 2.0.0 (#276, #282, #293).**
  - *What changed:* `calculateCenteredCrop` floors the shorter axis, and derives the longer one as round(short · L / S), capped at floor(L / cropFactor). A quotient within 4 ulps (units in the last place) of the next whole pixel counts as that pixel.
  - *Effect:* the longer axis can be 1 px smaller than in 1.x (6000×4000 at 1.7× gives 3528×2352).
  - `calculateSubjectFramingCrop` no longer reports a subject that fits as clipped.
  - *Migration:* update stored crop dimensions.
- **35 mm crop factor (#293).**
  - *What changed:* the crop factor is now √(1872/(w² + h²)), and the diagonal avoids `Math.hypot`. Some `cropFactor35Mm`, `diagonalMm` and `equivalentFocalLength35Mm` values change by 1 ulp.
  - *Migration:* none for archives; stored focal equivalents are accepted within 8 ulps.
- **Type widenings (#296, #303).**
  - `LensSampledPsfProfile.interpolation` is the union `LensSampledPsfInterpolation`.
  - Front-of-lens filter `polarizationModeled` fields are `boolean`; filter `schemaVersion` is `"0.1.0" | "0.2.0"`; `compositionModel` gains a Stokes–Mueller value; results add `incidentPolarization`/`transmittedPolarization`.
  - `PreparedGeometricMapping.schemaVersion` is `"0.1.0" | "0.2.0"`; the transform purpose union gains `"projection"`; `DigitalGeometricTransform` gains two variants.
  - `SensorEnvironmentRadianceQuery.projection` can be `null` (only with a non-rectilinear mapping).
  - `ProductionImageFormationBlockerCode` gains `missing-lens-field-mapping`.
  - *Migration:* existing 0.1.0 profiles and documents work unchanged; update exhaustive switches.

**Exposure, motion and flash**

- **Flash, readout and metering unions (#297).**
  - `FlashSyncCapabilityProfile.highSpeedSyncSupported` is `boolean`, with optional `highSpeedSync`. `schemaVersion` is `"0.1.0" | "0.2.0"`. 0.1.0 documents parse unchanged and cannot claim HSS (high-speed sync).
  - `ProductionTemporalCaptureResult.readoutExposureSynchronization` adds `"electronic-rolling-shutter-line-linked"`.
  - `CreateManualFlashIlluminationOverlayInput.resolvedSync` widens to `FlashOverlaySyncRegistration`.
  - `ExposureMeteringPolicy` gains `highlight-priority`.
  - Metering provenance `relative-pre-exposure-metering` is 1.1.0, with no change in value.
  - *Migration:* update exhaustive switches; use a 0.2.0 sync profile for HSS.
- **White-balance source `"color-temperature"` (#291).**
  - `ResolvedWhiteBalanceState.source` and `CaptureWhiteBalanceIntent.source` gain this value.
  - The `adopted-white-xyz-scaling` variant of `CaptureColorWhiteBalance` gains an optional `transform`, which is rejected on other kinds.
  - *Migration:* add a case to exhaustive switches; existing serialized states still parse.

**Serialization, validation and export**

- **Stricter input validation (#276, #282, #293).**
  - Canonical JSON rejects non-plain objects (Map, Set, Date, typed arrays, class instances and similar) and array holes, instead of hashing them as `{}`. Output for plain JSON is byte-identical.
  - Root functions throw `InvalidConfigurationError` for null, primitive, array or missing sub-object input. Every calculator rejects unknown fields (next item).
  - `estimatedResult`/`calibratedResult` require `quality`, and result factories reject empty provenance identities.
  - `calculateSensorResponsivityPhotocurrent` always validates `operatingElectricalConditions` and returns them parsed.
  - `serializeProductionImageFormationPlan` rejects objects whose version or fingerprint does not match.
  - *Migration:* pass plain JSON, remove extra fields, and give factories a quality and a provenance.
- **Every calculator rejects unknown input fields (#276).**
  - *Why:* 1.x ignored an unknown field on 196 root functions, for example `calculateSignalToNoise()` and `calculateProjectedMotionBlur()`. A typo or a wrong unit suffix (`focusDistanceMm` for `focusDistanceM`) then fell back to a default without any error.
  - *What changed:* every root function that takes an input object now throws `InvalidConfigurationError` for an unknown top-level field, most with the message `<name> input has unknown field "<field>".` `test/root-export-input-errors.test.ts` lists every root function. The record parsers follow in the next item.
  - *Effect:* calls with extra fields now fail. `prepareImageFormationContext()` and `createProductionCaptureSnapshot()` still accept the `version` and `fingerprint` of a record they produced, and recompute both.
  - *Migration:* remove extra fields, and fix misspelled or wrong-unit field names. To change an engine result and pass it back, copy only the documented input fields.
- **Every record parser rejects unknown fields, at every level (owner decision, 2026-10-17).**
  - *Why:* the `parse*()` parsers and the functions that take a whole record silently dropped fields they did not know. A misspelled or stale field in a stored profile was lost without any error.
  - *What changed:* every `parse*()` record parser, and the 13 record-taking functions (`assessMtfOnlyPsfRenderability`, `assessRadiometryReadiness`, `assessSceneMaterialResponseFidelity`, `calculateEffectiveSaturationCode`, `createRollingShutterCaptureExposureSchedule`, `createTtlScaledFlashProfile`, `integrateDiscreteSpectralLineMeasure`, `prepareColorMatchingFunctions`, `prepareColorimetricSpectrum`, `resolveAntiAliasingSpatialKernel`, `resolveSceneIlluminationDiscreteLineMeasure`, `serializeProductionImageFormationPlan`, `validateCalculationQuality`), throws `InvalidConfigurationError` for an unknown field at any object level. The message names the path and the field, for example `sceneIlluminationProfile.sources[0].magnitude has unknown field "wattsPerSteradian".` Parsers that already had their own message keep it and add `Unknown field "<field>".` Each accepted schema version, and each `kind` of a record, has its own allowed fields, so a field of another version or kind is rejected too. Records the engine writes still parse: fixed flags such as `sceneRadianceCalculated: false` are accepted with their fixed value only, and a resolved boundary schedule may keep its derived `unitVectorNative` if it matches. `calculateEffectiveSaturationCode` accepts a `SensorRawCodeSample` plus the regime's `integralNonLinearity`, and nothing else. Scientific output is unchanged.
  - *Effect:* stored profiles and records with extra fields no longer parse. Old schema versions (for example filter 0.1.0, flash sync 0.1.0, sensor architecture 0.2.0) still parse when they hold only their own fields. Nested records passed to calculators are checked by the same parsers, so extra nested fields fail there too.
  - *Migration:* remove unknown fields from stored profiles and records; the error names the field.
- **Read-only result envelopes (#276).**
  - *Why:* a caller could change a result that another caller or a cache shared.
  - *What changed:* every `CalculationResult` is frozen. The envelope, `provenance` (with `assumptions`) and `quality` are frozen all the way down; `value` is frozen at its top level. `CalculationResult` marks `value`, `provenance` and `quality` as `readonly`. Nested objects inside `value` and typed arrays stay mutable; domains that own their data (captures, RAW, export metadata, presets) already freeze it deeply.
  - *Effect:* writing to a result throws a `TypeError` in strict-mode code (and fails silently in sloppy-mode scripts). The result factories also freeze the value, assumptions and quality objects you pass them. Every result costs a few `Object.freeze` calls (measured A/B against 28f8b61 on a shared 4-vCPU Xeon host, Node 24.21, medians of 3–5 alternating runs; indicative only):
    - per-point mapping calls (`npm run bench:image-formation`): about 0.3–0.45 µs more per call, 1.2–1.9× slower; the batch mapping APIs 0.91–1.08× (within noise);
    - `simulatePocCamera()` (`scripts/benchmark-composed-baseline.mjs`), which builds many internal results per request: 1.62–1.69× slower (11.9 → 19.6 µs per base request). Freezing only the envelope measured 1.15–1.28×; no freezing measured 0.97–1.20×;
    - native environment RAW (`scripts/benchmark-v1-environment.mjs`): 0.84–1.08×, within noise, because its lean executor builds few envelopes;
    - a generic deep freeze of `value` made a small scalar call about 3× slower and was not adopted. See `docs/API_STYLE.md` "Read-only results".
  - *Migration:* copy a value before changing it (`{ ...result.value }` or `structuredClone(result.value)`). Use the batch mapping APIs in per-point loops.
- **Consistent error classes (#276).**
  - *Why:* the same kind of mistake threw different classes in different modules. For example a non-object input threw `InvalidScientificInputError` in some calculators and `InvalidConfigurationError` in others, and a negative flash guide number threw `InvalidConfigurationError`.
  - *What changed:* one rule (`docs/API_STYLE.md` "Error classes"). A wrong shape is an `InvalidConfigurationError`: a non-object or non-array, a missing sub-object, an unknown field, an unknown kind, mode, policy or version string, or a malformed identifier. A bad number in a calculation is an `InvalidScientificInputError`. Defects inside a versioned record or options object stay configuration errors. About 190 throw sites moved from `InvalidScientificInputError` to `InvalidConfigurationError`. The scalar flash (`calculateFlashGuideNumber`, `calculateFlashPowerForDistance`, `resolveTtlFlashExposure` numbers), shutter-angle and video (`calculateShutterAngleExposureSeconds`, `calculateShutterAngleFromExposureSeconds`, `assessShutterAngleRule`, `resolveVideoFrameSequence` numbers), `calculateHighlightPriorityPlacementSignal` and `calculatePhotonEnergyFromWavelength` wavelength checks moved the other way. Internal seed-derivation errors are `InvalidScientificInputError` instead of a plain `RangeError`. Messages and `code` fields are unchanged. `test/error-class-consistency.test.ts` scans the source for violations.
  - *Effect:* `instanceof` checks and `code` comparisons on these errors can change. `InvalidScientificInputError` still extends `RangeError` and `InvalidConfigurationError` still extends `TypeError`.
  - *Migration:* catch both domain classes, or branch on `error.code`: `INVALID_CONFIGURATION` means fix the shape or field names, `INVALID_SCIENTIFIC_INPUT` means fix the value.
- **Spectral channel binding format v2 (#276, #282, #293).**
  - `SENSOR_SPECTRAL_RESPONSE_CHANNEL_BINDING_FORMAT` is `photivra-spectral-channel-response-canonical-json-v2` (sorted-key JSON of the parsed channel).
  - v1 bindings from 1.5.0 and earlier are rejected with a version error.
  - *Migration:* recompute the quadrature and reduction with 2.0.0.
- **Print JPEG schema 0.2.0 and baseline JPEG encoder v2 (#274, #278, #298).**
  - Print JPEG output gains `encoderId`.
  - IFD0 always carries XResolution/YResolution/ResolutionUnit (72 dpi when `pixelsPerInch` is omitted — the Exif 2.32 value for unknown resolution) and YCbCrPositioning.
  - The Exif IFD adds ExifVersion `"0232"`, FlashpixVersion and ComponentsConfiguration. The paired-export JPEG gets the same tags.
  - `EXPORT_JPEG_ENCODER_ID` is `photivra-baseline-jpeg-444-v2`: correctly rounded DCT cosines and half-away-from-zero quantization. Bytes differ from 1.x only where a coefficient sat within about one ulp of a half-integer, and are now identical across V8 and JavaScriptCore.
  - `maximumProviderReads` now caps exactly ⌈crop height/32⌉ × ⌈crop width/256⌉ crop-aligned strip reads, and fails before the first read when the cap is too small.
  - *Migration:* treat JFIF units = 0, or the absence of `pixelsPerInch` in the XMP plan, as "no physical size"; size the read budget by the new formula.
- **POC API 1.0.0 (#276, #282, #293).** (POC = the proof-of-concept `simulatePocCamera()` contract.)
  - `POC_SIMULATION_API_VERSION` is **1.0.0**. `simulatePocCamera()` values change through depth of field, crop and shake pitch.
  - The repository-only POC transport (not a package export) now returns: 400 for out-of-range aperture/focus and malformed JSON (fixed message); 413 `PAYLOAD_TOO_LARGE`; 422 `SIMULATION_RESULT_OUT_OF_RANGE` for non-finite results; 500 `INTERNAL_ERROR` with a fixed message; and a bodiless 204 preflight.
  - *Migration:* handle 413, 422 and 500 as well as 400.
- **Package contents (#293).**
  - The manifest has no `prepare` or other install scripts. Git installs need `npm ci && npm run build`; contributors run `npm run hooks:install`.
  - No longer shipped: declaration maps; docs other than USAGE, API_REFERENCE, QUICK_START, AGENT_GUIDE (#313), `llms.txt` (#313), `api/` and examples; and the unreachable `browser-native-reference-*` and `schema/{camera,scene}.js` modules.
  - *Migration:* read the other guides in the repository.

**Colorimetry: third-party coefficients removed (owner decision, 2026-10-17)**

- **Own CIE 1931 colour-matching-function fit replaces the Wyman et al. (2013) coefficients.**
  - *Why:* the Wyman, Sloan & Shirley paper is CC BY-ND. The owner decided to remove third-party numbers with any licence question.
  - *What changed:* `estimateCie1931ColorMatchingFunctions` uses coefficients the engine fitted itself to the CIE 1931 2° data (same kind of model: a sum of piecewise Gaussians). The CMF source kind `"wyman-2013-cie-1931-multi-lobe-fit"` is now `"analytic-cie-1931-multi-lobe-fit"`, and `WYMAN_2013_CMF_DOMAIN_NANOMETERS` is now `ANALYTIC_CIE_1931_CMF_DOMAIN_NANOMETERS` (still 360–830 nm). The provenance model is `cie-xyz-spectral-integration-analytic-cmf`, and `COLORIMETRY_MODEL_VERSION` is 2.0.0. The fit is still an approximation, slightly closer to the CIE data (maximum error 0.0122/0.00733/0.0221 for x̄/ȳ/z̄, was 0.0140/0.00800/0.0222; see `docs/COLORIMETRY.md`).
  - *Effect:* colour outputs change slightly. Illuminant A integrates to xy (0.4480, 0.4074), was (0.4463, 0.4087). `simulateCapture()` RAW codes move by up to about 0.5 % (mean +1 to +5 codes), so its pinned output digests changed.
  - *Migration:* replace the old kind and constant names. Re-render anything that must match 2.0.0 colour exactly.
- **Planckian locus computed from Planck's law; the Kim et al. (2002) spline is removed.**
  - *Why:* the cubic-spline coefficients come from Kang et al. (2002), which is also claimed in a (lapsed) patent. The owner decided to remove them.
  - *What changed:* the locus is the chromaticity of Planck's law integrated against the engine's analytic CMFs on 1 nm nodes, 1000–100000 K. The locus kind `"kim-2002-cubic-spline"` is now `"planck-analytic-cmf"`, the default of `resolveColorTemperatureWhiteBalance`. `KIM_2002_PLANCKIAN_LOCUS_RANGE_KELVIN` (1667–25000 K) is now `PLANCKIAN_LOCUS_RANGE_KELVIN` (1000–100000 K). `estimatePlanckianLocusChromaticity` keeps its name and uses the new locus. Resolved white-balance states record `planckianLocusModel: "planck-analytic-cmf"`, and states with `"kim-2002-cubic-spline"` are rejected.
  - *Effect:* locus points move by up to 7.0e-4 in CIE 1960 uv from 2000 to 25000 K (1.4e-3 at 1667 K). The CCT of the daylight-locus point at 6504 K becomes 6516.6 K (was 6500.0 K), and Kelvin white-balance gains change by up to 0.5 %. A CCT/Duv search costs about 0.03 ms (0.02 ms with the spline; see Performance).
  - *Migration:* replace `{ kind: "kim-2002-cubic-spline" }` with `{ kind: "planck-analytic-cmf" }` (or omit it for the default) and the range constant name. Re-resolve stored Kelvin/tint white-balance states. For a locus from tabulated CIE CMFs, use `{ kind: "planck-integration", colorMatchingFunctions, quadratureNodes }`.
- **CIE94: the `cie94-textiles` preset is removed; callers pass their own factors.**
  - *Why:* the textiles weights trace only to secondary web pages, not to a free primary source. The primary, CIE 116-1995, is not free.
  - *What changed:* the formulas `"cie94-graphic-arts"` and `"cie94-textiles"` are replaced by one formula, `"cie94"`. By default it uses the formula's published reference conditions (k_L = k_C = k_H = 1, K₁ = 0.045, K₂ = 0.015, the old graphic-arts values). A new option, `cie94Factors: { lightness, chroma, hue, k1, k2 }` (type `Cie94ParametricFactors`), sets all five factors. It is validated and rejects unknown fields.
  - *Effect:* the old formula names are rejected. Default results equal the old `"cie94-graphic-arts"` results. The result's `formula` and method id are now `"cie94"` and `"color-difference-cie94"`.
  - *Migration:* replace `"cie94-graphic-arts"` with `"cie94"`. For textiles or other conditions, pass the factors explicitly from a source you have checked: `{ formula: "cie94", cie94Factors: { lightness, chroma, hue, k1, k2 } }`.

### Added

- **`simulateCapture()` (#300).** A full capture from a few options.
  - Returns the image, packed RAW, the executed request and plan, provenance, and an `assumptions` list naming every default.
  - Exposure modes: manual, aperture-priority, shutter-priority and program.
  - White balance: by scene illuminant, auto, none, Kelvin/tint, or gains.
  - Output: `srgb-8`, `srgb-16` or `jpeg`.
  - Procedural chart presets (uniform, slanted edge, Siemens star, step wedge, grey ramp, checkerboard, point grid, caller-spectrum patches) with `resolveChartScene` and helpers.
  - `SIMULATE_CAPTURE_FACADE_VERSION` 1.0.0; `docs/QUICK_START.md` (shipped) and `docs/examples/simulate-capture.mjs`.
- **`simulateCapture()` uses the 2.0 features (#306, #307).** All opt-in. Without the new options, the 1.0 facade output is byte-identical at the same illuminance (the default illuminance changed; see *Free-source citations* below), apart from the colour-matching-function change under *Breaking changes*. Every choice is listed in `assumptions`.
  - `output.format: "png"` with `colorEncoding` `srgb`, `display-p3` or `rec2020`. The unclipped linear development is converted through CIE XYZ, clipped once in the target gamut, and signalled with cICP. The `rec2100-pq` and `rec2100-hlg` encodings prepared for 2.0 were removed before release: pQ and HLG (ITU-R BT.2100) are not shipped in 2.0 because their patent holders offer only licence-on-request declarations (owner decision, 2026-10-17; see the patent review in `THIRD_PARTY.md`).
  - Optional `gamutMapping: "perceptual"` (constant CIELAB L* and hue).
  - `output.format: "dng"`.
  - `output.demosaic` (`bilinear`) and `borderHandling` (`margin`, `mirror`).
  - `lens.projection`, `lens.distortion` (radial or Brown–Conrady), `lens.vignetting` and `lens.psf`.
  - `motion.angularVelocityRadPerSec` and `motion.shutter: "rolling"`.
- **Native RAW DNG (#307).** `serializeNativeRawDng()` writes a lossless 16-bit CFA (colour filter array) DNG directly from packed native RAW.
  - Tags: per-phase BlackLevel and CFAPattern from the ActiveArea origin; WhiteLevel from the effective saturation code; ActiveArea, DefaultCrop, Orientation, ColorMatrix1, ForwardMatrix1, AsShotNeutral, BaselineExposure and an optional NoiseProfile.
  - It declares no linear master, and counts the saturation flags DNG cannot carry.
  - `NATIVE_RAW_DNG_SCHEMA_VERSION` 1.0.0.
- **Colorimetry (#291).**
  - Analytic CIE 1931 colour-matching functions (the engine's own fit, labelled approximation) or caller-tabulated CMFs; `integrateSpectrumToXyz`.
  - Planck radiance, illuminant A, CIE daylight with caller-supplied basis spectra, the Planckian locus from Planck's law, McCamy CCT, and nearest-locus CCT/Duv with its inverse. (CCT = correlated colour temperature.)
  - Chromatic adaptation: Bradford, CAT16 and XYZ scaling, with a caller-supplied degree of adaptation. CAT02, the von Kries Hunt–Pointer–Estévez transform and a CIECAM02 degree-of-adaptation helper are not part of 2.0: no free source we could confirm prints the CAT02 or HPE matrix or the CIECAM02 formula for D (owner decisions, 2026-10-17). The `"cat02"` and `"von-kries-hpe"` transforms and `calculateDegreeOfAdaptation` prepared for 2.0 never ship, in `calculateChromaticAdaptationMatrix` or in `calculateCaptureColorTransform`. CAT16 has a free source, IS&T CIC24 2016 Eq. (15).
  - CIELAB/LCh, and ΔE76, CIE94 and CIEDE2000.
  - `estimateCameraColorMatrix`.
  - RGB colour spaces (sRGB, Rec.709, Display P3, Rec.2020) and sRGB, BT.709 and BT.1886 transfers; gamut mapping. PQ and HLG (ITU-R BT.2100) are not shipped in 2.0 because their patent holders offer only licence-on-request declarations (owner decision, 2026-10-17; see the patent review in `THIRD_PARTY.md`). The PQ/HLG functions and constants prepared for 2.0 (`evaluatePqEotf`, `evaluatePqInverseEotf`, `PQ_CONSTANTS`, `evaluateHlgOetf`, `evaluateHlgInverseOetf`, `HLG_CONSTANTS`, `calculateHlgSystemGamma`, `prepareHlgReferenceDisplay`, `HlgReferenceDisplay`) never ship. `resolveRgbColorSpace("rec2020").sources` lists only ITU-R BT.2020-2.
  - `resolveColorTemperatureWhiteBalance` turns Kelvin + tint into channel gains. `calculateCaptureColorTransform` takes an optional adaptation `transform`.
- **Sensor (#290).**
  - `createIsoGainReadoutRegimes()`: ISO-dependent analog and digital gain, with read noise per conversion gain.
  - Regime fields `adc.digitalGain`, `adc.integralNonLinearity` and `exposureIndexGain`.
  - Opt-in fixed-pattern noise (`parseSensorFixedPatternNoiseProfile`, `calculateSensorFixedPatternSite`, `SENSOR_FIXED_PATTERN_NOISE_MODEL`).
  - A `log-linear-temperature-table` dark-current model.
  - Tier `rollingReadoutTiming` and `fixedPatternNoise` assets.
- **RAW development (#295).**
  - `highlightMode` (`clip` or `reconstruct`) with diagnostics.
  - Tone curves `extended-reinhard-luminance` and `naka-rushton-luminance`.
  - `calculateEffectiveSaturationCode`.
  - DNG ForwardMatrix1, BaselineExposure, NoiseProfile and AnalogBalance.
  - Progress reporting on development and native SDR.
  - `createPhotographicExportPair(input, { signal })`.
- **Optics (#296, #303).**
  - Fisheye and equirectangular projections (`calculateLensProjection*`, and an optional `projectionModel` on field of view).
  - Brown–Conrady distortion and its inverse.
  - Longitudinal chromatic aberration and Cauchy dispersion.
  - Natural and mechanical vignetting.
  - Polygon-pupil Fraunhofer PSF.
  - Zernike/Seidel wavefronts and the Maréchal Strehl ratio.
  - Centroid-aligned and rotational PSF interpolation.
  - A linear polarizer (filter schema 0.2.0).
  - Atmospheric haze.
  - Focus breathing.
  - Geometric mappings gain `brown-conrady` and `projection-remap` transforms (mapping schema 0.2.0). Environment capture accepts an optional `lensFieldMapping`, which the production plan composes.
- **Motion, video and flash (#297).**
  - Electronic rolling-shutter exposure schedules, so skew, partial exposure and flicker banding emerge in image formation.
  - Video frame sequences and shutter-angle helpers.
  - Flash guide number, pre-flash TTL (through-the-lens metering) and high-speed sync (sync schema 0.2.0).
  - The `highlight-priority` metering policy.
- **Export formats (#298).**
  - `parseDngRawImage`: a bounded DNG/TIFF-EP reader (uncompressed and lossless JPEG, 8–16 bit), with `DNG_IMPORT_SCHEMA_VERSION` 1.0.0 and `DNG_IMPORT_LIMITS`.
  - `parseLosslessJpeg` (ITU-T T.81 Annex H).
  - `serializePngImage`: 8/16-bit RGB PNG with sRGB, iCCP or cICP for Display P3 and BT.2020 (sRGB, BT.709 or linear transfer); mDCV/cLLI metadata; deterministic in-house zlib. No PQ or HLG code points.
  - `EXPORT_JPEG_ENCODER_ID`.
  - AVIF and HEIC are not provided.
- **Processing (#302).** All opt-in. See `docs/PROCESSING.md`.
  - Bilinear Bayer demosaic profiles, AHD demosaicing and CFA-plane reconstruction. The Malvar–He–Cutler kernels prepared for 2.0 were removed before release (owner decision, 2026-10-17): Microsoft's US 7,502,505 is in force until about January 25, 2027, and its claim 1 closely matches the method. The `malvar-he-cutler-2004` kernel and the `simulateCapture()` option `output.demosaic: "malvar-he-cutler"` never ship. They may return after the patent expires (about 25 Jan 2027). Bilinear (the default) and AHD are unchanged, and the hash-lock tests confirm the default output is unchanged. See the patent review in `THIRD_PARTY.md`.
  - `borderHandling: "mirror"` for RAW development.
  - Noise-optimal HDR bracket merge, and conversion to float32 linear BT.2020 (`createHdrImageEncodingTask`, `transfer: "linear-float32"` only). Its PQ/HLG modes and their integer-code options were removed before release; the SDR outputs are unchanged, as the hash-lock tests confirm.
  - Reinhard and Durand–Dorsey tone mapping, exposure fusion, focus stacking and known-rotation panoramas.
  - Bilateral and non-local-means denoise, unsharp mask, and an explicitly synthetic film grain.
  - A shared `ProcessingTask` contract.
- **Opt-in WebGPU backend (#304).** See `docs/WEBGPU.md`.
  - `createImageKernelAccelerator()` runs isoplanatic PSF convolution, native capture SDR and packed RAW development as `webgpu-f32`.
  - Results are labelled with a float32 error bound stated in advance, and are never claimed to be bit-identical. The CPU float64 reference stays the default.
  - Also `calculateIrradianceConvolution()` and its plan (schema 0.1.0), `ImageKernelExecutionError`, and the repository-only `npm run test:webgpu`.
- **WebGPU image-formation stages and accuracy contract (#277).** See `docs/WEBGPU.md`.
  - **Accuracy contract:** per-stage a-priori bounds, kept separate from method error, and `composeRelativeErrorBounds()` for chaining linear stages.
  - **Sensor stage:** `simulatePackedSensorRaw()` (schema 0.1.0) is the per-site producer's charge, noise and ADC on typed arrays. It is bit-identical to `calculateNativeRawSite`. `accelerator.simulateSensorRaw()` runs it on `webgpu-f32` with the same seeded noise model (`photivra-native-raw-noise` 0.4.0, MurmurHash3 per-site seeds). The new `exact-except-flagged-sites` label means every unflagged site equals the reference exactly. Flagged sites are listed in `flaggedSiteIndices` and covered by a statistical-equivalence test.
  - **Sensor stage, fixed-pattern noise and extra charge:** `PackedSensorRawInput` takes an optional `fixedPatternNoise` (a `SensorFixedPatternNoiseProfile` and its colour-site origin) and up to 8 `additionalChargeComponents` (Poisson or deterministic). The reference stays bit-identical to the per-site engine functions with both (tested), and `webgpu-f32` keeps the `exact-except-flagged-sites` guarantee (0 differing sites on SwiftShader).
  - **Luminance tone curves on the GPU:** `renderNativeCaptureSdr` and `developNativeRaw` on `webgpu-f32` now run `extended-reinhard-luminance` and `naka-rushton-luminance` (exponent ≥ 1) instead of rejecting them. Their code bound is a running bound: a fixed per-sample formula evaluated from the kernel's own values, and the run's largest value is reported. On SwiftShader every code was within 1 of the reference.
  - **Kernels from lens PSFs:** `resolveLensPsfConvolutionKernels()` (schema 0.1.0) resolves a `LensSampledPsfProfile` at each patch centre with `resolveLensSampledPsf` and maps its taps onto site displacements with the per-site quadrature's own inverse support. Equal pitches give exact site sampling; other pitches use bilinear splatting, a labelled approximation that is the adjoint of bilinear interpolation (tested). Several wavelengths give a weighted spectral kernel.
  - **Scene radiance on the GPU:** `calculateChartRadianceBatch()` (schema 0.1.0) answers many radiance or spectral-integral queries on the engine's chart presets, using the planar provider's own `radianceAt`. `accelerator.evaluateChartRadiance()` runs it on `webgpu-f32`: the GPU classifies materials with a-priori bounds, flagged points are recomputed on the host, and every value is the reference rounded once to float32 (relative 2^-24; 0 misclassified points on SwiftShader). `mapEnvironmentDirectionsToChartPoints()` converts environment-direction queries.
  - **Per-fixture rollout:** for every built-in chart preset, the GPU image-formation path's method error against the per-site engine is measured on sampled tiles and pinned in tests (`docs/WEBGPU.md`, "Per-fixture rollout"). With a synthetic, strongly field-varying PSF and 8-site patches it is 1.2–2.5 % of the tile peak, and larger at sub-site detail (16.8 % at a point-grid disk edge with 2 µm PSF samples; 24.9 % at the Siemens-star centre, where both paths alias). These are accuracy numbers, not speed.
  - **Exposure and motion:** `calculateTemporalExposureSum()` (schema 0.1.0) is a weighted sum of shifted frames with per-row weights, for rolling or global readout. Sub-site shifts use bilinear interpolation, a labelled approximation. `accelerator.sumTemporalExposure()` runs it on `webgpu-f32` with a relative bound.
  - **Timings:** the repository-only `npm run bench:webgpu` times the stages at 6–24 MP on the owner's hardware. No hardware timings have been measured yet.
- **Optical-stage reuse (#288).** `NativeEnvironmentRawInput.opticalStage` returns an opaque optical stage. `createNativeEnvironmentSensorStageTask()` then re-runs only dark charge, capacity, noise and ADC after edits that come after the optics. Optical changes are refused.
- **Opt-in parallel native environment RAW (#275).** `calculateNativeRawRowBands()` splits a capture into row bands, `createNativeEnvironmentRawPartitionTask()` runs one band (for example in a Web Worker or Node worker thread, with the caller's own provider), and `composeNativeEnvironmentRawPartitions()` joins the posted partitions. The merged output is byte-identical to `createNativeEnvironmentRawTask()` for the same input (`test/native-environment-partitions.test.ts`). No worker code is bundled. Measured with `scripts/benchmark-native-environment-workers.mjs` on a shared 4-vCPU host, 48×48 sampled PSF: 1.53 s on one thread, 0.66 s with 4 workers (2.3×); cheap default-optics sites gain much less.
- **Batched light sampling (#275).** Optional `NativeEnvironmentRawProvider.evaluateRadianceBatch(queries, signal)` receives every radiance query of a tile (`NativeEnvironmentRadianceQuery`, in per-query callback order) and returns the results in order, synchronously or as a promise. Results are validated like per-query results, so the output is identical for the same results (`test/native-environment-batch.test.ts`). It is meant for GPU, WebAssembly or cross-thread providers; with a JavaScript provider on the CPU it is about as fast as per-query callbacks (48×48: default 0.29 → 0.27 s, 4 pupil rays 2.11 → 2.43 s).
- **Smaller additions.**
  - `PrintJpegInput.pixelsPerInch` (1–65535; #278).
  - The `LensComplexPupilPsf.sampling` field (#284).
  - `SENSOR_SPECTRAL_RESPONSE_CHANNEL_BINDING_FORMAT` (#293).
  - A `"default"` export condition so Node ≥ 22.12 can `require()` the package; the `./package.json` export; JS source maps with inline sources; and declarations that type-check with `lib: ["es2022"]` alone (#293).

### Free-source citations (owner decisions)

The engine now relies on free-to-read sources wherever one was found. See the citation audit in the 2.0.0 release record.

- **Numeric change: `simulateCapture()` exposure anchor.**
  - *What changed:* the anchor no longer uses the reflected-light meter constant K = 12.5 cd·s/m² of a paid standard. It uses CIPA DC-004-2020 (free): standard output sensitivity S = 10/H and the camera equation H = 0.65·L·t/N², with an 18 % grey as the reference. This is equivalent to K = 10/0.65 ≈ 15.38 cd·s/m².
  - *Effect:* `SIMULATE_CAPTURE_DEFAULT_ILLUMINANCE_LUX` changes from π·12.5·64·125/18 ≈ 17 453.29 lux to π·10·64·125/(0.65·100·0.18) = π·80 000/11.7 ≈ 21 480.98 lux, a factor of 10/(0.65·12.5) ≈ 1.231 (about 0.30 EV). The metered reference luminance for f/8, 1/125 s, ISO 100 changes from 1000 cd/m² to 80 000/65 ≈ 1230.77 cd/m², so `exposure.meteredSceneLuminanceCdPerSquareMeter` of the default grey card changes by the same factor. Default captures are brighter: the green RAW level of the 18 % grey card goes from about 10.6 % to about 13.1 % of RAW white. Auto-exposure modes resolve N²/t = 0.65·L·S/10 instead of L·S/12.5. The `illuminanceLux` and `exposure.referenceExposure` assumption texts change.
  - *Unchanged:* with `illuminanceLux` set to the old default, every 1.0 facade output (samples, RAW codes, JPEG, request, scene digest) is byte-identical; a test checks that, and pins the new default digests.
  - *Migration:* pass `illuminanceLux: Math.PI * 12.5 * 64 * 125 / 18` to reproduce earlier captures.
- **Text-only output change: runtime strings.** No number changes.
  - Provenance and assumption strings that named paid standards now name free sources: RGB colour-space `sources` (`srgb`: "W3C CSS Color Module Level 4 srgb"; `display-p3`: "W3C CSS Color Module Level 4 display-p3 (…)", "ITU-T H.273 ColourPrimaries 12"), the matrix-derivation assumption of `resolveRgbColorSpace`, the CIELAB assumptions, the daylight-locus assumption, the CCT Duv-sign assumption (now the engine's own convention), the HDR encoding assumptions (ITU-R BT.2100 PQ; BT.2020 matrices), the facade's PNG colour-encoding texts, and the illuminant A scene description.
  - The `calculateCorrelatedColorTemperature` error for |Duv| > 0.05 is reworded.
  - Limitation and error strings that used internal ticket numbers as model names (#12, #14, #85, #110) now name the model: exposure-window model, sensor pipeline, scene-radiance provider, and the scene-radiance-to-sensor-irradiance optical bridge (stabilization, extended-object projection, flash, temporal metering, RAW frame and production image-formation plan).
  - *Migration:* code that matches these strings exactly must update them. Result model ids are unchanged.
- **Documentation and tests.** The flash guide-number relations are derived in full from the inverse-square law and the camera equation (the guide-number measurement standard is no longer cited). Tristimulus integration cites Wyman, Sloan & Shirley (2013), Eq. 1; Planck's law cites the BIPM kelvin *mise en pratique*. CIE94 cites a free secondary source and is checked by closed-form cases computed in the test. The RGB↔XYZ derivation is written out in `docs/COLORIMETRY.md`, and a new test shows the engine's matrices equal the W3C CSS Color 4 matrices within 1e-12. The Duv sign (positive above the Planckian locus) cites Ohno's free CORM 2011 slides (slide 5); the engine documents it, and a new test checks that a greenish light has a positive Duv. The ISO-brightness test uses the DC-004 mid-grey reference (0.18 of white) instead of a paid saturation-speed ratio.
- **Documentation: CAT16 matrix source (owner decision, 2026-10-17).** The CAT16 cone matrix now cites the free IS&T paper of Li et al. (2016), "A Revision of CIECAM02 and its CAT and UCS", CIC24, Eq. (15), doi:10.2352/ISSN.2169-2629.2017.32.208; its nine coefficients were checked against the engine. That paper does not print the CAT02 matrix, so CAT02 keeps its earlier sources. The patent review in `THIRD_PARTY.md` records that no patent was found claiming either matrix. Comments and docs only.

### Fixed

- Captures, packed RAW and export hashes (`simulationHash`, DNG/JPEG SHA-256) are now identical across the V8 and JavaScriptCore JavaScript engines. The POC hash corpus passes on every engine without overrides (#293).
- ISO now changes RAW and developed brightness. Base-ISO white sits at ADC full scale, instead of code 20512 of 65535 (#290).
- ADC round-half-up is exact (0.49999999999999994 rounds to 0). Poisson draws for means ≥ 1e9 have the correct variance (#290).
- RAW development (#295) fixes:
  - double white balance;
  - AsShotNeutral written as the camera white squared;
  - coloured clipped highlights;
  - ignored saturation flags;
  - WhiteLevel written as the ADC maximum;
  - BlackLevel and CFA phase taken from the absolute origin instead of the ActiveArea;
  - an unclear error when Web Crypto is missing.
- Print and paired-export JPEG Exif carry every tag that Exif 2.32 makes mandatory for compressed images (#278, #298).
- `Math.floor(x + 0.5)` rounding is replaced by exact rounding in SDR rendering, linear encoding and Print JPEG sRGB codes (#295, #298).
- Auto ISO with Shutter or Aperture Priority picks a grid value equal to the ideal within `settingEquals` tolerance. Grid end points within tolerance are no longer reported as clamped (#272, #281).
- Valid exit-pupil declarations are no longer rejected, and packaged docs no longer link to unshipped files (#293).
- The illumination-vignetting solver for interior extremes uses a stable scaled quadratic (#296).
- `resolveLensSampledPsf` no longer rejects an interpolated pupil throughput that floating-point weights lift a few ulps above 1 (#307).
- `simulateCapture()` validates pupil sampling (4–64 angular samples, at most 256 rays) before doing any work (#306).
- Colour, haze, projection and PNG inputs reject unknown fields in nested records too, as the 2.0.0 strict-records rule requires: XYZ and white points (`x`, `y`, `z` only), xy chromaticities (`x`, `y` only), CIELAB/LCh colours, CIEDE2000 `parametricFactors` (now as strict as `cie94Factors`), each Planckian `locus` kind, `wavelengthRangeNanometers`, the `createCieDaylightSpectrum` basis, RGB `primaries`, the haze `extinction` model, lens-projection `direction` and `imagePointMm`, and the PNG `colourEncoding`, `masteringDisplay` and `contentLightLevel`. Before, a typo such as `extinction.rayleighExponet` silently fell back to the default Rayleigh exponent 4. *Migration:* remove extra fields; a luminance `Y` beside an xy chromaticity is no longer accepted.
- `calculateChromaticityFromCorrelatedColorTemperature` (and so `resolveColorTemperatureWhiteBalance`) throws `InvalidScientificInputError` when CCT + Duv lands outside x ≥ 0, y > 0, x + y ≤ 1. 2000 K with Duv +0.02 used to return x + y = 1.0595, a chromaticity the engine itself rejects as input, and a Kelvin white-balance state built on it.
- `serializePngImage` no longer accepts `Object.prototype` names as code points: `primaries: "constructor"`, `transfer: "toString"` or `renderingIntent: "toString"` wrote reserved cICP or sRGB bytes. The lookups are now maps, and unknown `colourEncoding` fields are rejected.
- `createHdrBracketMergeTask` never returns NaN or Infinity. Exposure times below 1 ns are rejected (at 10⁻¹⁷⁰ s, t² underflowed and the weights became 0/0; see `docs/PROCESSING.md` for why 1 ns keeps every quantity finite in float32), and a merge that still gives a non-finite or out-of-float32 value fails with `InvalidScientificInputError`.
- `mapEnvironmentDirectionsToChartPoints` rejects directions that map to a non-finite chart point, such as the grazing (1, 0, −1e-320), which gave −Infinity and NaN, or a non-finite component.
- `highlight-weighted` metering is now documented as a highlight-emphasis mean: about 0.5–0.8 EV darker than uniform metering in scenes with bright accents. Its behaviour is unchanged. The new `highlight-priority` policy is the one that places highlights (#297).
- **A missing, null or non-object sub-object no longer escapes as a raw `TypeError` (pre-release review).** As "Stricter input validation" promises, these root functions now throw `InvalidConfigurationError` naming the part: `estimateCameraShakeBlur`, `calculateProjectedMotionBlur`, both camera-rotation mappings, every `src/output/capture-geometry.ts` transform and field-of-view function, `resolveVideoFrameSequence` (`rollingShutter: null`), `resolveTtlFlashExposure` (`guideNumber: null`, malformed zones), `simulateCapture` (`camera: { body: 1, lens: 1 }`, `output.whiteBalance.channelGains: null`), and, from a sweep of the motion, stabilization and exposure modules, the exposure-mode resolvers, ordinary and high-speed flash sync and overlays, `parseManualFlashProfile`, `meterRelativeExposure`, scene-radiance and temporal metering, `setExposureCompensationOnMeterTarget`, `calculateSensorGeometryMetrics` (`nativeRaster: null`), the capture-rotation trajectory, inverse-mapping and quadrature functions, `calculateStabilizedCaptureTemporalSamples`, extended-object projection and translation parallax. Valid input gives the same result. `test/helpers/sub-object-probe.ts` removes, nulls or replaces each nested object of a valid input in turn and requires a domain error.
- **Nested objects reject unknown fields (pre-release review).** Before, an extra field was dropped silently, for example `angularVelocityRadPerSec: { yaw, pitch, roll: 5 }` in `estimateCameraShakeBlur`, which has no roll term. Now these throw `InvalidConfigurationError` naming the field: `estimateCameraShakeBlur` `angularVelocityRadPerSec`; `calculateProjectedMotionBlur` `positionM` and `velocityMps`; the camera-rotation mappings' `imagePointMm`, `angularVelocityRadPerSec` and `samplingPitchMicrometers`; `resolveVideoFrameSequence` `automation` and `rollingShutter`; the TTL `guideNumber`; `simulateCapture` `output.whiteBalance.channelGains`.
  - A `simulateCapture` camera given as a preset object must have exactly the `GenericEquipmentTierPreset` shape: unknown fields at the top level, in `body`, in `lens` and in `lens.matchedReference` are rejected, and each body and lens profile is re-checked by its own strict parser. A copy of a catalog preset still gives the same capture as its tier id.
  - `output.jpegQuantizationStep` is rejected unless `output.format` is `"jpeg"` (`format: "png", jpegQuantizationStep: 9999` used to succeed silently).
  - *Migration:* remove the extra field; the error names it.
- **`simulateCapture` scene digest covers caller spectra (pre-release review).** `scene.sourceSha256` (also the RAW source and spectral data-artifact checksum) ignored caller spectra, so a 3000 K and a 9000 K `spectrum` illuminant gave the same digest. The hashed scene description now includes each caller spectrum: tabulated data exactly as its (wavelength, value) pairs, a function spectrum sampled at 1 nm over 380–780 nm. This covers a `spectrum` illuminant, a `daylight` illuminant (its computed spectrum and the basis `datasetId`) and chart reflectance spectra (`uniform`, `patches`). Captures without caller spectra keep their digests (the pinned digests in `test/simulate-capture-integration.test.ts` are unchanged); captures with caller spectra get new digests. The images are unchanged.
- **`simulateCapture` JPEG progress completes (pre-release review).** The `jpeg` stage counted 8 × 8 blocks, but the encoder reads 256 × 32 source tiles, so its last event stopped short (2 of 64 at 64 × 64). The total and the encoder's `maximumProviderReads` budget are now ⌈height/32⌉ × ⌈width/256⌉, and the last event has `completedTileCount === totalTileCount`. The image data is unchanged (identical from the quantization tables on); the JPEG file bytes change only because the embedded XMP `PrintExportPlan` records the corrected read budget, for images larger than 32 rows or 256 columns. The pinned 8 × 8 `jpegAuto` digest is unchanged.
- Durand–Dorsey tone mapping (`createDurandDorseyToneMappingTask`) no longer lets one black pixel flatten the image. Pixels with luminance ≤ 0 were floored to log₁₀ = −30, which set the base range: one such pixel in a 4-decade ramp moved the compression factor from 0.180 to 0.022 and roughly quadrupled the run time. They are now left out of the bilateral filter and of the base range, stay 0 in the output, and report `baseLog10 = −Infinity`. An all-zero image returns zeros with compression factor 1. Output changes only for images that contain zero-luminance pixels; images without them are byte-identical (`test/processing-tone-mapping.test.ts`).
- WebGPU accelerator (#277) fixes. GPU output values are unchanged:
  - The `webgpu-f32` error bounds of the convolution and the temporal sum now cover weights below 2^-126. The host can round such a weight to zero and a GPU can flush it, so with samples up to 2^100 the reported bound could be exceeded (for example by 2^-60 against a bound near 2^-125). The bound gains a term 2·S_max × (the at-risk weights), which is 0 when no weight is that small (docs/WEBGPU.md).
  - Convolution readback buffers are released after each band. Before, every band's readback stayed alive until the end, so GPU memory grew with the image instead of the band.
  - A WebGPU device that arrives after acquisition was aborted is now destroyed instead of leaking.

### Performance

Unless marked otherwise, output is bit-identical to the code before the change, checked by committed hash and frozen-oracle tests. Timings come from the source PRs, on small fixtures, on a shared 4-vCPU Linux host under Node 24. They are indicative only.

- **Native environment RAW (#285, #292, #294).**
  - Changes: one finite-number pre-walk; a cached parse of engine-owned PSF profiles; one PSF parse per event instead of per site; no per-site serialization of shared state; site plans that keep only the frozen request and image-plane point.
  - Native acquisition is 2.2–3.0× faster on the 2×2 workloads.
  - With a large sampled PSF, CPU per site falls by about 30 %, and a site plan shrinks from about 25 to 8 MB.
  - The native RAW identity walk is about 3× faster (73 → 46 µs per site).
- **Native SDR** uses a typed-array kernel (about 10–13× faster; 24 MP 8-bit 33.9 → 3.3 s) and an exact LUT-based 8-bit sRGB quantization (#286, #295).
- **RAW development** uses a typed kernel (#295):
  - 10–15× faster at 1 MP; 24 MP in 3.8–4.6 s instead of 33–42 s;
  - creation is O(metadata) (220 → 4 ms at 24 MP);
  - 24 MP peak array memory falls from 389 to 229 MiB.

  The output changes listed under Breaking changes are intentional and separate from this speed-up.
- **JPEG (#286, #298):**
  - an exact-order faster DCT and entropy coder (about 1.6–2.2×; #286);
  - a growing output buffer instead of a zero-filled full budget (a 384-byte JPEG at a 256 MB budget: 256 MB / ~130 ms → 64 KiB / 0.02 ms);
  - Print JPEG strip reads with an sRGB LUT (24 MP 1:1: 375,000 → 3,000 provider reads; 4 MP → 0.25 MP: 1,245 → 339 ms) (#298).
- **Stabilization evaluation** is linear-time (16,000 samples: 3,100 → 222 ms). Native acquisition and development yield to the host about every 8 ms, now also between sites inside a tile, so `cancel()` takes effect after about one site (#287, #292).
- **Optional optical-stage reuse** re-runs the sensor stage 5.0–11.4× faster than a full recompute (#288).
- **Lean per-site executor (#305).** Native environment RAW (and so `simulateCapture()`) runs sites that match a self-verified template through a lean per-site executor.
  - Same maths, same floating-point order, but without redundant per-site re-validation and result envelopes.
  - Every data-dependent check remains, and falls back to the full engine functions. RAW, callbacks and errors are byte-identical.
  - `simulateCapture()` 64×64: 6.0 → 0.87 s CPU; 128×128: 20.6 → 2.2 s. RAW stage 0.95 → 0.12 ms per site.
  - Sampled-PSF and lens-mapped sites are lean-eligible too (#275 follow-up). Their kernels, tap points and mapped queries come from the full chain's own functions; the PSF quadrature's checks still run after each instant's callbacks, and the full quadrature decides when one fails. Output is byte-identical (`test/native-environment-lean.test.ts`). `simulateCapture()` 48×48 (`scripts/benchmark-native-environment.mjs`): 3×3 sampled PSF 11.9 → 1.96 s (6.1×); radial distortion 2.63 → 0.59 s (4.4×).
  - Pupil-ray sites compute their rays with `calculateSensorApertureRays`' own core after one validation per template, and copy each ray for the provider key by key instead of with `structuredClone` (#275). Byte-identical (`test/aperture-ray-fast-path.test.ts`, lean tests). `simulateCapture()` 48×48 with 1×4 pupil rays: 2.19 → 1.26 s (1.7×).
  - All #275 follow-ups together, same benchmark and host, main before vs after: sampled PSF 11.2 → 1.60 s (7.0×), radial distortion 2.66 → 0.46 s (5.7×), 1×4 pupil rays 2.32 → 1.15 s (2.0×), default optics unchanged within noise (0.33 vs 0.34 s); RAW and image SHA-256 identical in every case.
- **CCT/Duv search by Newton root-find (owner approval 2026-10-17).** *Not bit-identical.*
  - Changes: `calculateCorrelatedColorTemperature` solves d(uv distance²)/dT = 0 with the analytic temperature derivative of Planck's law (safeguarded Newton with bisection, bracketed by the cached coarse scan, converged to 1e-10 of T), instead of a golden-section search. Duv and the inverse use the analytic locus normal instead of finite differences.
  - Speed (`scripts/benchmark-planckian-locus.mjs`, medians, same 4-vCPU host): CCT/Duv 366 → 31.3 µs (11.7×); chromaticity from CCT + Duv 22.5 → 16.5 µs; Kelvin white balance 21.3 → 18.6 µs.
  - Results: CCT now agrees with a 50-digit reference root to 3.3e-12 relative. The old search was off by up to 6.0e-3 K below 25000 K and 0.089 K (1.2e-6 relative) above, so CCT changes by those amounts. Duv changes by at most 8.3e-16. The inverse moves xy by at most 9.3e-10 (1.4e-7 at exactly 1000 or 100000 K); at Duv = 0 it is unchanged. No pinned digest changed. Points whose nearest locus point lies just inside a range limit now resolve instead of failing.
- **`simulateCapture` auto white balance (pre-release review).** `whiteBalance: "auto"` retained the optical stage, which took the first RAW pass off the lean per-site executor, and then re-ran the sensor stage. It now runs the lean RAW task twice: once to measure grey-world AWB, once with the measured intent. Image, RAW, JPEG, PNG, DNG, request and diagnostics are byte-identical to before on seven cases (chart, illuminant, tier, PNG/P3, DNG, rolling-shutter motion, pupil rays, mirror border) and the pinned `jpegAuto` digest. Only the `output.whiteBalance.auto` assumption text and the provenance contract list change: they now say the radiance queries are repeated (`diagnostics.providerEvaluationCount` still counts one pass). 96 × 96 Siemens star, same 4-vCPU host, Node 24.21, medians of 5: auto 12.9 → 3.86 s (3.4×); scene-illuminant 2.20 s before and 2.10 s after (unchanged within noise), so auto now takes about 1.8× a scene-illuminant capture instead of 5.9×.
- **`simulateCapture` host yields (pre-release review).** The facade yielded with `setTimeout(…, 0)` about every 8 ms. Browsers clamp nested zero-delay timers to at least 4 ms (WHATWG HTML timer nesting rule), so a capture could sit idle for a large share of its run. It now yields with `scheduler.yield()` where available, else a `MessageChannel` message, else `setImmediate`, else `setTimeout` (`src/facade/host-yield.ts`; no import, browser-surface gate unchanged). Output is unchanged (digests identical). A 128 × 128 capture yields about 250 times. Node 24.21 (MessageChannel path, same 4-vCPU host, origin/main vs this change, two alternating rounds, medians of 5 each): sRGB 2.92/2.89 → 2.36/2.59 s, JPEG 2.72/2.80 → 2.62/2.79 s, PNG/P3 2.76/2.87 → 2.57/2.56 s. Node's timer floor is 1 ms, so the expected saving in Node is about 0.25 s per capture; the spread between rounds is of the same size, so treat the Node gain as small and noisy. The larger browser saving is expected from the 4 ms clamp but was not measured here.
- **PNG encoder.** Bit-reversed fixed-Huffman codes, length and distance codes precomputed once (instead of reversing every symbol bit by bit), a preallocated output buffer, a rolling LZ77 hash, a one-byte check at the current best length before comparing a chain candidate, and one specialised loop per PNG filter (the adaptive heuristic sums costs with a lookup table instead of writing five candidate rows through a closure). Output bytes are unchanged: a SHA-256 over 789 cases (60 images, 8- and 16-bit, every filter and both compression modes, 30 raw zlib streams, 1200×900 images and an iCCP profile) matched before and after, and `test/png-encoder.test.ts` now pins a digest. 4000×3000 RGB, medians of 5 runs, before and after run back to back on the same shared 4-vCPU host, Node 24: 16-bit noise, default settings, 9.8 → 6.1 s; 8-bit gradient 3.3 → 1.0 s; 16-bit noise without filtering 6.8 → 4.3 s; 16-bit noise, stored 4.4 → 2.0 s. On noise the remaining time is mostly the LZ77 match search, which byte identity keeps as it is.
- **PSF convolution kernels (`resolveLensPsfConvolutionKernels`).** Each patch now accumulates straight into one scratch map sized for the largest allowed radius and keeps a copy cropped to its own reach, instead of holding every tap of every patch and wavelength as a heap object until the end. Every cell receives its weights in the same order as before, so the kernels are bit-identical (21 profile cases and all 15 kernel calls in the existing tests, before/after SHA-256; `test/lens-psf-kernels.test.ts` checks a direct per-tap sum bit for bit). Measured with medians of 3 runs, Node 24, on a shared 4-vCPU host, with a 41×41-tap synthetic Gaussian profile. 384 patches × 8 wavelengths: 5.8 s and 2.06 GB peak RSS → 1.3 s and 111 MB. 1504 patches × 16 wavelengths (2 MB of output): out of memory at a 4 GB heap → 8.0 s and 113 MB.
- **Sampled-PSF corner lookup.** `resolveLensSampledPsf` finds its interpolation corners by integer grid position instead of building partial coordinate objects and joined-string keys. It selects the same nodes, with the same weights, in the same order. `simulateCapture()` 64×64 with a 3×3×3-node sampled PSF: 6.46 → 4.88 s (medians of 5, interleaved, same host). Corner lookup falls from 1.46 s to 0.10 s of CPU profile. Image, RAW and request digests are identical, and so are 920 random `resolveLensSampledPsf` queries over a 7-axis profile.
- **WebGPU:** no GPU speed-up is claimed for the WebGPU backend. On the software adapter it was slower than the CPU (#304).

### Tests and tooling

- Coverage rose from 92.4 % to 94.4 % of lines and from 88.7 % to 91.0 % of branches. `npm run coverage` scales timeouts under V8 coverage (#299).
- New independent checks (#299): spot values beside the bit-identity hash locks, an independent camera-equation RAW oracle, a non-linear temporal-quadrature convergence test, and table-driven rejection tests for public parsers.
- An informational, non-blocking macOS CI job runs the hash-lock tests (#299). `npm run test:webgpu` runs conformance on a real GPU (#304). It now also covers the sensor stage, the temporal sum, luminance tone curves, chart radiance and the per-fixture rollout (89 tests in three files) and passes on SwiftShader (#277). `npm run test:webgpu:hardware` and `npm run bench:webgpu:hardware` run them on a hardware adapter on Linux, macOS or Windows and refuse a software adapter; they have not been run on hardware.
- Benchmark scripts that import `dist/` fail when the build is missing or stale (#292).
- `NUMERICAL_CORRECTNESS.md` documents the cross-engine determinism policy and the test hash locks; `API_STYLE.md` documents naming conventions (#293, #299).
- Plain-language rewrite of the source comments and docs: shorter sentences, jargon defined at first use, internal ticket chatter removed. Comments and prose only; the comment-stripped build is identical (#309–#312).
- For AI agents: `llms.txt` and `docs/AGENT_GUIDE.md` ship in the package, and the API reference opens with a task-to-function index that its generator checks against the root exports (#313).
- No CIE table values in tests (owner decision, 2026-10-17). The CMF, illuminant A, daylight and locus tests now check internal consistency, normalization, round trips and values computed from Planck's law and the daylight formula. The CIEDE2000 tests replace the Sharma et al. (2005) published pairs, whose data file carries no licence, with closed-form special cases computed from the formula. `scripts/fit-cie-1931-cmf.mjs` reproduces the CMF fit (it downloads the CIE table at fit time only), and `scripts/benchmark-planckian-locus.mjs` times the locus functions.
- No unclear-licence test inputs (owner rule, 2026-10-17): the MurmurHash3 vectors copied from a Stack Overflow answer are replaced by the test's own reimplementation of SMHasher's verification procedure (SMHasher is MIT-licensed; no code copied; the expected value 0xB0F57EE3 is a published fact); the Bradford test follows ICC.1:2010 Annex E with computed D65/D50 whites instead of a secondary website's matrix; the CIE94 worked values from the colour-science documentation are replaced by closed-form cases; the longitudinal-chromatic-aberration test uses a synthetic glass (n_d = 1.5, V_d = 60) instead of catalogue values.
- `docs/licenses/adobe-dng-patent-license-record.txt` records where the Adobe DNG patent licence was read (URL, date, page SHA-256), its exact required notice and a summary. It is not a copy of the licence: Adobe's Terms of Use do not clearly allow copying its website text.
- Every test and helper file in `test/` now starts with `// SPDX-License-Identifier: Apache-2.0` (117 files that lacked it; all are the project's own work).
- New CI job `licence scan`: ScanCode Toolkit 32.5.0 (hash-pinned in `.github/scancode-requirements.txt`) scans the repository, and `scripts/check-scancode-policy.mjs` fails on a non-Apache-2.0 licence finding or a foreign copyright holder unless the file and finding are on its reviewed allowlist. See `docs/DEVELOPERS.md`. The pull-request template now asks for the source, licence and patent check of new algorithms, constant sets, datasets and file formats.
- `AGENTS.md` is reset to a short standard file with three rules: evidence-based changes, free-to-use sources only, and owner approval for anything that goes to production (#308, #313).

## 1.5.0 — published October 7, 2026

See [the 1.5.0 release record](https://github.com/Photivra/photivra/blob/main/docs/RELEASE_1_5_0.md) for the candidate review.

- Add optional `NativeRawInput.tileWidth` (1–256 native sites) so bounded native RAW acquisition can use smaller execution chunks while preserving the existing 256-site default, physical sampling, absolute CFA coordinates, deterministic noise seeds, shutter timing, output payload and existing whole-event/resource caps.
- Preserve the exact acquisition tile width through same-RAW validation and development. Reject invalid widths, inconsistent tile counts and stale plans instead of silently rebuilding a default-width plan.
- Keep the separable ideal-emission experiment repository-only under `src/api/`; it is not part of the npm/root API and establishes no production Focus, source-separability, full-native or device-readiness claim. Dense-pupil qualification remains tracked separately in #224.
- Include the test-only Node 24 timeout stabilization from #229; it changes no engine behavior or scientific assertions.
- Include #232's repository-only independent photon/electron qualification tests and complete 2×2 resource pilots. These establish bounded checkpoint evidence, not full-native Focus, depth/refinement or device qualification; no experimental root export or resource-limit change.

## 1.4.0 — published October 4, 2026

See [the 1.4.0 release record](https://github.com/Photivra/photivra/blob/main/docs/RELEASE_1_4_0.md) for the candidate review.

- Add standalone evidence-bound ideal circular pupil rays and optional origin-aware bounded photo/RAW evaluation. Reuse shared focus and camera rotation, average normalized pupil irradiances before the existing sensor pipeline, and retain exact-once working-f-number throughput. Reject simultaneous sampled PSF, missing callbacks, invalid geometry and excessive budgets before provider work. Production depth/visibility composition remains unsupported. See `docs/SENSOR_APERTURE_RAYS.md`.

- Add separate metadata-only packed native RAW, physical source-to-RAW and same-RAW reconstruction/SDR tasks with explicit 24 MP admission, bounded tiles, absolute CFA/seed identities, cancellation and single-transfer ownership. Preserve the reference RAW caps and scalar mathematics.
- Add bounded post-SDR Print crop/area downsampling and original baseline JPEG encoding with an original sRGB ICC profile. Explicit source hashes remain caller declarations; platform save/share, printer appearance and physical device acceptance are separate.
- Record complete one-megapixel constructed RAW → SDR → downsampled JPEG execution and independently decoded JPEG/ICC/area-filter controls. See [native RAW and Print contracts](https://github.com/Photivra/photivra/blob/main/docs/NATIVE_RAW_AND_PRINT.md).

## 1.3.0 — published October 4, 2026

- Add evidence-bound radial illumination throughput to bounded environment photo/RAW execution, validating every inverse PSF tap before provider callbacks and applying attenuation once in physical sensor coordinates. Production composition requires explicit vignetting fidelity. Preserve unity arithmetic, resource limits and unverified transport flags.

## 1.2.0 — published October 3, 2026

- Add metadata-only external RGB tile execution with explicit 24 MP/resource limits, whole-capture identity, unchanged reference arithmetic, cancellation/disposal and single-transfer output ownership. See `docs/NATIVE_CAPTURE_SDR.md`; review/version/publication and native-producer/device qualification remain separate.
- Add bounded paired linear processing differences and repeat-capture temporal statistics, plus a restricted MIT-licensed castleCSF static neutral Gabor contrast reference. Independently test arithmetic and owned public PSF, photocharge, JPEG, depth/defocus and motion paths. Full #196 source/backend/perception/product acceptance remains blocked; see `docs/PRINT_195_196_REVIEW.md`.
- Add explicit complex-pupil propagation distance and result binding (model 1.1.0), preserving omitted-input nominal focal-plane kernel values. Finite-focus callers can pass the shared resolved image distance without implying qualified exit-pupil geometry.
- Audit #195 planning acceptance across print/viewing scales, retained crops, invalid-input recovery and exact integer alternatives.

## 1.1.0 — published October 3, 2026 (historical preparation notes)

- Add a bounded regional coherent-sinusoid diagnostic and explicit stage/region/source identity. Independently validate Fourier modulation and angular projection using owned analytic references; preserve acquisition, system MTF, noise/artifact/perception qualification as unassessed. Full #196 acceptance remains blocked. See `docs/PRINT_DETAIL_ASSESSMENT.md` and `docs/PRINT_DETAIL_VALIDATION.md`.

- Add native-only Print planning and conditional size queries. Independent viewing distance and explicit pixel/stroke/line-pair conventions derive density; advanced manual PPI creates a distinct plan. Preserve confirmed native crop/orientation and exact-ratio integer output, reconcile declared lab constraints, and return no recommendation for upscale or conflicts. Captured detail and delivery remain unassessed. See `docs/PRINT_PLANNING.md`.
- Align package/root creator identity at 1.1.0 for this additive release. Existing APIs, archived records, fixtures and all independent schema/POC/production-plan versions remain unchanged. See `docs/RELEASE_1_1_0.md`.

## 1.0.1 — published October 2, 2026

- Expand Node support to maintained 22/24 LTS plus 26 Current, with patched-major CI and the existing 22.13 minimum job, reviewed lifecycle windows and updated tooling guidance. Keep Node 24 build/typings baseline.
- Align the npm package and `ENGINE_API_VERSION` at 1.0.1 and enforce equality in source metadata, generated references and isolated packed consumers. Schema/model/POC/plan versions and scientific calculations are unchanged. New capture/plan creator identities and hashes can differ; archived records and acceptance artifacts retain their original versions. See `docs/RELEASE_1_0_1.md`.

## 1.0.0 — published October 2, 2026

- Prepare the stable public distribution after all 32 V1 feature/science items and defect #178 are reviewed and merged. Package/lock/citation become 1.0.0; root contract 0.116.0 and every independent model/schema/POC/plan identity remain unchanged. No scientific arithmetic, seed, fixture hash, exported signature or accepted execution envelope changes.
- Reconcile human/agent/source guidance, actual bounded production integration and closed tier/performance/export/conformance acceptance. Add developer capability navigation, exact root-export reference, packed executable examples, strict documentation/consumer checks and exact owner tag/publish procedure.
- Preserve synthetic/calibration/visibility/PSF/resolution limits and the recorded external-editor/hash/build limitations. Review compatibility/migration and owner handoff in `docs/RELEASE_1_0.md`; this entry does not certify npm publication.
- The preparation evidence is in [the final 1.0.0 preparation audit](https://github.com/Photivra/photivra/blob/main/docs/RELEASE_AUDIT.md).

## Historical development — engine API 0.116.0

The following entries record introduction-time work and version identities. Older pending/draft/issue-count statements are historical checkpoints; the 1.0 release contract and current domain guides own present status.

- Complete the proposed final #131 scientific conformance disposition: shared-reference relative metering and exposure control through independently predicted photon/dark counts, committed production RAW/processing and paired output; controlled light/compensation/time/orientation/render variants, exact replay and fail-closed bindings. Reuse merged tier/performance evidence with explicit synthetic limits; no runtime/API/asset/dependency change. See `docs/SCIENTIFIC_CONFORMANCE.md`.

- Complete the proposed final #43/#45 performance disposition on stabilized V1 main with paired whole-consumer equivalence/timing, preparation/memory profiles and dense executed environment-to-RAW evidence. Retain merged private reuse; no further public abstraction or runtime/API change. See `docs/V1_PERFORMANCE_DISPOSITION.md`.

- Complete the proposed #119 generic tier acceptance layer with reproducible versioned physical/correction-cost/corrected reports, finite multidimensional pupil/texture envelopes, same-capture edge/noise comparisons and independently predicted signed stabilization/ordinary flash checks. Reuse existing body and production/output acceptance; no calibration claims, runtime/asset/version changes or new dependency. See `docs/TIER_ACCEPTANCE.md`.

- Complete the proposed #116 generic preset acceptance disposition: all nine exact body/lens pairings through bounded authoritative environment capture, ISO/readout, exact RAW processing and paired output; independent phase-sum checks and controlled sampled scenes for all 27 finite pupil slices. Preserve synthetic limits, separate #119 validation ownership and unchanged 1.0.0 assets/runtime/version contracts. See `docs/TIER_PRESET_ACCEPTANCE.md`.

- Add the bounded executed environment-to-RAW handoff to the authoritative production graph. Plan 0.7.0 validates committed event, scene/provider/optics, geometry, shutter, rotation, renderer and seed bindings before source callbacks, fingerprints execution data/results, and supplies the exact realized RAW to optional shared processing. Consumer manifest 0.2.0 carries the same immutable execution/output results. Existing attached-RAW and physical-sample paths retain explicit unsupported boundaries. Share existing output-envelope validation without changing supported limits, scientific models, seed schedules or package/POC versions. See `docs/PRODUCTION_ENVIRONMENT_CAPTURE.md`.

## Engine API 0.115.0

- Prepare producer-derived #16 interoperability acceptance: committed all-orientation/manual-WB DNG/JPEG pairs, reproducible repository-only generator, independent TIFF/JPEG/two-XML/LibRaw verification and explicit native-site/unsupported-size evidence. Preserve historical fixtures and shared existing algorithms. Adobe/editor/browser evidence and owner review/DCO remain required; no issue closure, new runtime dependency or API/version change. See `docs/EXPORT_ACCEPTANCE.md`.

- Complete the bounded #112 SDR post-capture handoff: expose shared `calculateProcessedSensorRaw()`/parser for RAW preview and paired JPEG, retain explicit color/WB/rendering/correction states and capture diagnostics, support 8/16-bit preview while JPEG remains 8-bit. Production plan 0.6.0 accepts committed output-state/RAW policy, executes four downstream stages and fingerprints their immutable result/evidence. Upstream missing-stage blockers remain; no physical-provider, high-resolution or external-editor acceptance is inferred. See `docs/PROCESSED_OUTPUT.md`. Merged in #200 after owner review/DCO; V1 tracker stands at 26/32.

## Engine API 0.114.0

- Add `calculateEnvironmentSensorPhotoSignal()` and `simulateEnvironmentSensorRawFrame()`: generate and execute bounded environment queries at each actual local shutter midpoint, wavelength and optional complete PSF support tap, then reuse optics, instantaneous EQE, temporal photo/dark, completeness, capacity, seeded noise and ADC. Bind full native frame geometry, optics, scene identity and event exactly. Frozen provider requests, owned parsed results and aggregate evaluation limits fail closed. Resulting RAW feeds existing paired DNG/JPEG export. Invocation is established without claiming physical provider transport/visibility, calibrated accuracy, full-resolution support or production-plan activation. See `docs/ENVIRONMENT_RAW_CAPTURE.md`. Partial #16/#178 integration; V1 remains 25/32.

## Engine API 0.113.0

- Add `calculateSensorEnvironmentRadianceQuery()`: derive an environment request from native sensor optical support with explicit +Y-down/+Y-up conversion, focus-aware ideal projection, existing analytic inverse camera rotation and outgoing-toward-camera direction convention. Explicit opening-boundary clock mapping preserves time semantics. Ray projection is calculated; intersections, visibility, provider transport and production activation remain absent. See `docs/SENSOR_ENVIRONMENT_QUERY.md`. Partial #16/#178 integration.

## Engine API 0.112.0

- Add `calculateSensorPsfIrradianceQuadrature()`: resolve sampled lens PSFs at each pre-AA destination/wavelength and apply their normalized shape to explicitly supplied inverse kernel support. Convert native +Y-down support to image-plane +Y-up PSF axes; retain separate pupil throughput, wavelength-basis evidence, exact instantaneous times and local shift-invariance limitations. Complete support and bounded work fail closed. No full field-dependent forward transport, source projection/provider execution or production activation is inferred. See `docs/SENSOR_PSF_QUADRATURE.md`. Partial #16/#178 integration.

## Engine API 0.111.0

- Add `calculateSceneSensorEqeTemporalExposure()`: compose declared physical scene radiance through paraxial optics and instantaneous response validity/EQE at every local shutter midpoint. Sensor inputs own spatial/spectral plans; explicit package-plane and first-opening-boundary time semantics prevent plane/clock reinterpretation. Shared internal temporal identity/work preflight preserves existing sensor diagnostics and budgets. No provider/projection/PSF execution, convergence bound or production activation is inferred. See `docs/SCENE_SENSOR_TEMPORAL_EXPOSURE.md`. Partial #16/#178 resolution.

## Engine API 0.110.0

- Add a validated compact temporal EQE photo signal and connect it to exact-event dark/accumulated charge and native RAW. Preserve stationary arithmetic and narrow-call types; share compensated integration sums. Producer result schema 0.3.0 and temporal dark/charge model 1.1.0 distinguish the additive path without changing noise/readout identities. Global/rolling tests verify independent SI counts, deterministic codes and exact paired DNG/JPEG lineage. Source transport/PSF, convergence and production activation remain unverified; no umbrella closure. See `docs/TEMPORAL_PHOTO_RAW.md`. Partial #16/#178 resolution.

## Engine API 0.109.0

- Add `calculateSensorEqeTemporalExposure()`: independently validate response/range/EQE at each explicitly supplied local shutter midpoint and integrate physical rates with seconds-valued measures. Share the existing instantaneous path without changing stationary behavior; retain child evidence, deterministic canonical ordering and bounded Cartesian work. No stationarity, source transport, PSF, convergence or RAW activation is inferred. This new nonstationary result deliberately cannot enter the stationary charge/RAW contract. See `docs/SENSOR_EQE_TEMPORAL_EXPOSURE.md`. Partial #16/#178 resolution.

## Engine API 0.108.0

- Add `calculateSceneToSensorIrradianceQuadrature()`: bind wavelength-resolved scene-provider declarations to each exact spatial/wavelength/time node and evaluate the existing paraxial optical bridge at its pre-AA coordinate. Share Cartesian node validation with the existing irradiance reducer, preserving equations and prior diagnostics while rejecting sparse sample arrays explicitly. Pre-stack/package-incident output feeds matching effective EQE; source projection, provider execution, PSF and temporal integration remain unverified/unapplied, and production gates remain unchanged. See `docs/SCENE_SENSOR_QUADRATURE.md`. Partial #16/#178 resolution.

## Engine API 0.107.0

- Add `calculateSensorEqeLocalExposure`, composing existing spatial/spectral quadrature, explicitly supplied irradiance, response application/range checks, EQE rate, local shutter binding and stationary integration. Preserve child evidence and approximation boundaries; demonstrate the resulting photo expectation through RAW and paired files. Scene/optics origin remains declared, production stages remain gated, and time-varying irradiance is unsupported. See `docs/SENSOR_EQE_LOCAL_EXPOSURE.md`. Partial #16/#178 resolution.

## Engine API 0.106.0

- Map all 32 V1 features to primitives, implemented consumers, representative evidence and remaining ticket ownership. Document the missing typed scene/optics/sensor-response-to-exposure RAW handoff and correct adjacent production-boundary descriptions. Documentation only; no stage activation, runtime/version change, approved deferral or feature closure. Partial defect #178 resolution.

- Define the RAW reference compatibility envelope and share full-native producer/reconstruction limits while retaining the larger structural attachment budget. Export parsing rejects unsupported crop sampling, uncovered output/active reconstruction and non-Bayer topology before pixel execution. Supported execution, hashes, bytes and versions remain unchanged; invalid-request diagnostic precedence may change. Partial defect #178 resolution.

- Move reusable sensor-channel color development and conditioned inversion into an internal color-layer adapter. Preserve explicit profile evidence/basis binding, one-time WB order, exact RAW lineage and paired file identities; export retains validation and container policy. Partial defect #178 resolution; no public API or version change.

- Share sorted-key finite-JSON serialization mechanics across planner fingerprints, capture-derived comparisons and export hashing. Preserve domain-specific undefined-property policies/errors, existing identity algorithms and all version surfaces; pinned historical export/file hashes detect byte drift. Partial defect #178 resolution.

- Consolidate equivalent child-first immutable-data freezing across capture, RAW attachment/reconstruction, export metadata and generic equipment presets into one internal helper. Domain validation/copy ownership and planner/focus/release freeze semantics are preserved; no public API, schema, numerical or identity change. Partial defect #178 resolution.

- Correct production-plan diagnostics to report the current plan contract version instead of a stale hard-coded version, and document the existing `distribute*` public verb family. Diagnostic text changes only; blocker codes, validation, scientific behavior and all version surfaces remain unchanged. Partial defect #178 resolution.

- Add generic tier readout-to-file acceptance: explicit ISO regimes preserve expected/realized charge, independent ADC arithmetic predicts codes, and paired export preserves native RAW through orientation/rendering exposure. Synthetic topology/color/charge fixture; no runtime/API/assets change.

- Add matched generic tier body execution acceptance for release cadence/timer/limits, AF availability/hold/loss and release gating, independent metering/AWB arithmetic, and global readout timing. Synthetic policy evidence only; runtime/API/assets unchanged. See `docs/GENERIC_TIER_PRESETS.md`.

- Extend generic tier correction acceptance with independent residual CA/distortion, full Jacobian/stretch, same-capture slanted-step interpolation/gain and support/retained-ray checks. Synthetic sampled regression evidence only; runtime/API/assets unchanged. See `docs/GENERIC_TIER_PRESETS.md`.

- Correct the electronic read-noise boundary: preserve negative read noise through the upper-only pre-ADC threshold, add the black pedestal, then quantize/clamp to the unsigned ADC range. Readout model 2.0.0 and capture RAW noise model 0.2.0 distinguish changed shadow codes from prior replay.
- Add incremental #131 conformance for the merged global sensor RAW producer → reconstruction/color/WB → correction → SDR/paired export path. Independent numeric and lattice expectations cover exposure boundaries, four orientations, same-noise correction, signed shadows and display clipping; no final V1 closure.

## Generic tier presets — engine API 0.105.0

- Add exact-version Consumer, Prosumer and Professional generic body/lens reference assets, cross-tier selection and strict saved-manifest validation. A finite 50 mm, f/4, focus 5 m optical slice resolves explicit profiles rather than a tier quality multiplier. Matched pupil and same-capture correction fixtures expose field/defocus character and gain/noise tradeoffs. See `docs/GENERIC_TIER_PRESETS.md`.
- Synthetic educational approximations only; no calibration, universal ranking, sensor-format default, production/POC activation or complete #116/#119 acceptance claim. Preset assets are version 1.0.0; saved selection schema 0.1.0. Root API 0.105.0 follows the local-shutter 0.104.0 contract in PR #173.

## Local shutter RAW binding — engine API 0.104.0

- Added optional full-native local shutter-window binding to the RAW producer (producer result schema 0.2.0). Exact per-site photo/dark/completeness windows must match the existing engine timing calculation. Omitted timing retains global behavior and unchanged native seed ownership; no rolling motion/radiance integration or production-stage activation is claimed.

- Reuse call-owned geometric preparation across sampling-plan pixels through the existing scalar point evaluator. Preserve external revalidation, per-point radial/finite guards, provenance and independent derivative arrays. Whole correction/plan timing and separate CPU/allocation evidence are recorded in `docs/GEOMETRIC_PREPARATION_REUSE.md`; no public API/schema version change or generic prepared cache.

- Reuse the existing focus-plane projection privately for POC defocus sweeps. Whole-request timings, separate allocation sampling, preparation/retained-memory limits and 64 complete-response equivalence fixtures are recorded in `docs/POC_PROJECTION_REUSE.md`. No root/POC/schema version change or public prepared API; one-off path overhead and Node-only performance evidence are explicit.

- Add optional RAW-derived JPEG correction to paired photographic export, reusing the capture correction executor after explicit color/WB. Preserve DNG codes and native crop; expose the processed crop, clipping diagnostics and separate informational RAW intent. Require full active reconstruction and reject unprovided prefiltering. No production-stage activation or external-editor validation claim.

## Capture-owned native RAW producer — unreleased

- Added `simulateSensorRawFrame()` and strict handoff parser: declared untreated EQE/dark exposure expectations → existing accumulated charge/completeness → physical capacity assessment → seeded charge realization → read noise/ADC → native CFA samples → immutable RAW attachment. A versioned capture-owned site seed schedule, full native coverage and global exposure/state checks are explicit. Child provenance/saturation diagnostics and genuine same-RAW DNG/JPEG tests are retained. See `docs/SENSOR_RAW_PRODUCER.md`.
- Root API advances to 0.102.0; producer schema/noise identity 0.1.0. Package/POC/capture/RAW-frame/production schemas are unchanged. The reference producer does not verify upstream radiometry, accept RGB as RAW input, support rolling/high-resolution/multi-frame capture or activate reserved production stages. New human review and contribution-specific DCO remain required.

## Capture-bound correction and SDR bridge — unreleased

- Added `calculateCaptureCorrectedSdr()` and its strict parser: committed capture/color/WB → native optical geometry/CA → gain → oriented joint-valid output view → existing SDR rendering. Four orientations, off-center crops, separate clocks and preserved source history are inspectable. Gain clipping events are separately reported by the correction executor. See `docs/CAPTURE_CORRECTED_SDR.md`.
- Root API advances to 0.101.0; package, POC, production and capture schemas are unchanged. No sensor producer, production-stage activation, editor acceptance or new dependency is claimed. Human review and new contribution-specific DCO certification remain required.

## Paired DNG/JPEG reference export — unreleased

- Added `createPhotographicExportPair()` and strict input/color-profile parsers: uncompressed 16-bit native Bayer DNG and baseline 8-bit YCbCr444 JPEG developed from the exact attached RAW frame. Explicit reconstruction, approximate camera color interpretation, existing resolved WB, final orientation/crop and existing SDR rendering are traceable; unsupported resampling fails closed. EXIF/XMP, distinct artifact identities and deterministic SHA-256 provenance accompany owned bytes. See `docs/PHOTOGRAPHIC_EXPORT.md`.
- Integrates pending capture-SDR, RAW attachment, metadata and reconstruction slices as one main-based draft. Proposed root API 0.100.0; export schema 0.1.0. No runtime dependency or package/POC/capture schema change. Full native input is limited to 4,096 sites. Editor interoperability, production execution and high-resolution support remain open gates.

## Same-RAW reconstruction handoff — unreleased

- Added #16C `resolveRawFrameReconstruction()`: bounded native-region values derived only from the attached #166 RAW frame via #14 explicit linear-neighborhood reconstruction, complete absolute-phase dispatch, child provenance and exact source contributions. Signed values survive; missing edges fail rather than padding/clamping/rephasing. Independent captured float planes are not used. No sensor color calibration, downstream WB/color/output processing or file writer is claimed. See `docs/RAW_FRAME_RECONSTRUCTION.md`.
- Proposed root API 0.99.0, handoff schema 0.1.0. Stacked draft requires #166; reconcile parallel additive root versions before merge. Existing package/POC/capture/production contracts are unchanged.

## Native RAW-frame attachment — unreleased

- Added #16 prerequisite `createSensorRawFrame()` and strict input parser: complete bounded native periodic-CFA coverage, exact one-site binding, immutable capture attachment, code/black/digital-white/per-site-seed preservation, and rejection of processed/grouped/multi-frame inputs. Producer origin is explicitly caller-declared; no serializer or RAW-to-RGB pairing proof is claimed. See `docs/SENSOR_RAW_FRAME.md`.
- Proposed root API 0.98.0 and RAW-frame schema 0.1.0. Reconcile additive root versions against parallel drafts before merge; existing package/POC/capture/production versions unchanged.

Notable public changes to `@photivra/engine` are documented here.

## Unreleased

### Added

- Added #1 ideal regular-polygon scalar Fraunhofer diffraction. The additive `calculateIdealPolygonDiffractionPsf()` returns continuous 1/µm² unit-energy density plus peak-normalized intensity using an analytical polygon boundary integral, explicit equal-area pupil size, propagation distance and resolved wavelength basis. No finite-support renormalization, throughput loss or real-lens effects are inferred. PSF foundation advances to `0.3.0`; root API advances to `0.94.0`. Existing circular Airy, sampled/complex-pupil schemas, production composition and POC behavior are unchanged.
- Added standalone #114 parametric clean-lens stray-light irradiance, #118 composed digital geometry/sampling and #117 generic camera-applied lens corrections. Exact system/wavelength bindings, separate ghost/veil contributions, full Jacobians, valid-source masks/joint crops, prefilter gates, channel registration, downstream gain/noise/clipping diagnostics, RAW metadata intent and mandatory/reference-bypass states are explicit. No calibrated presets, production/POC stage activation, optical-PSF repair or runtime dependency is added. See `docs/DIGITAL_OPTICS_FOUNDATION.md`. Root API advances to `0.95.0`; new schemas are `0.1.0`. Pending parallel API changes must reconcile versions in merge order.
- Added #15A/#15B/#15C authoritative capture, color and encoding foundations. `SimulatedCapture` schema `0.2.0` commits immutable format-neutral float planes, explicit linear image states, capture geometry/focal equivalence/focus/WB, public metadata, canonical serialization and external references. Legacy `0.1.0` archives normalize to `0.2.0`. Color model `0.1.0` independently derives the ideal colorimetric camera/linear-sRGB D65 basis, applies explicitly bound resolved RGB gains, or uses an explicitly approximate adopted-white XYZ diagonal transform. Signed floats/headroom are retained; arbitrary spectral/commercial sensor RGB and repeated application are rejected. Linear encoding schema `0.1.0` maps floats to uniform uint16 codes with explicit black/reference-white/headroom, negative and clipping policies, rounding ties and per-side clipping counts while preserving the master. #16 serialization remains separate. Root API advances to `0.96.0`; reconcile pending parallel API changes in merge order. Package/POC/production contracts are unchanged.

- Added independent #112A SDR rendering primitives (schema `0.1.0`) for explicitly color-transformed linear-sRGB/D65 input. Rendering exposure, named identity/positive-per-channel-Reinhard tone choices, explicit component gamut clipping/rejection, standard sRGB transfer, and deterministic 8/16-bit quantization remain separately inspectable. Unresolved WB/color, unsupported HDR policies and non-finite arithmetic fail closed; source samples remain unchanged. No capture/WB/correction adapter or production-stage activation is introduced in this standalone slice. Root API advances `0.96.0` to `0.97.0`; reconcile parallel version bumps in merge order. Package/POC contracts unchanged.

- Added #113 real-lens PSF/aberration framework. Unit-energy sampled 2D PSF profiles preserve image-plane orientation and support bounded regular-grid interpolation across focal length, #103 focus state (via focus diopters, including infinity), aperture, field coordinates, wavelength, and signed image-plane defocus. Best-focus image-plane offsets make field curvature and longitudinal chromatic focus explicit without changing distortion/lateral-CA coordinates. A scalar Fraunhofer complex-pupil reference path jointly evaluates diffraction plus explicit pupil amplitude/optical-path-difference phase while keeping pupil throughput as a separate factor for #110. MTF magnitude-only profiles are diagnostic and explicitly cannot authorize unique PSF reconstruction. Lens PSFs remain upstream of sensor OLPF/CFA/reconstruction and exclude #114 stray light.
- Added #3 extended-object time-varying projection. Explicit metric points on one rigidly translating object are projected independently through physical time with camera and object translation preserved as separate inputs. Pure axial motion can therefore leave an on-axis center nearly stationary while off-axis geometry expands/contracts. A uniform magnification diagnostic is emitted only for an explicitly declared and validated fronto-parallel planar patch; arbitrary 3D geometry never gains a one-scale or one-homography claim. A #12 capture-local wrapper samples the same geometry on each native point's authoritative local exposure clock. The result remains geometry only: no visibility/occlusion solution, synthetic blur kernel, radiance integration, deformation/acceleration, or static-defocus shortcut is claimed.
- Added #97 time-domain physical stabilization with generic synthetic sensor-shift, lens-optical, coordinated-body+lens, and off architectures. Explicit rotational disturbance trajectories are corrected with per-axis gain, latency and angular travel limits; declared panning-axis bypass suppresses only the chosen correction axis; coordinated profiles allocate one total correction without double counting. #12 local-exposure sampling evaluates residual stabilization on the authoritative first-opening-boundary time basis. Support/tripod state, CIPA-style stop ratings, camera translation/parallax, spontaneous drift and digital stabilization are deliberately not folded into this physical model. The legacy `stabilizationStopsEquivalent` API remains unchanged.
- Added #106 manual-flash and ordinary-sync foundations. A flash is represented as a spatial #85 illumination source plus an explicit aperiodic pulse waveform registered to #12's first-opening-boundary time basis. Front- and rear-curtain sync resolve only when the complete active frame has a real simultaneous-open interval long enough for the pulse; impossible ordinary sync fails closed. Existing ambient temporal illumination is preserved when the flash overlay is added. Optional #105 release-frame binding exposes sequence-relative pulse time. Schema 0.1.0 intentionally does not model HSS, TTL/preflash metering, recycle/thermal limits, red-eye preflash, modeling lights, AF-assist, or branded protocols, and never substitutes a post-render brightness multiplier.
- Completed #7 ISO/exposure-index and generic high-ISO signal-chain foundations. Detailed capability profiles now represent standard ISO/EI ranges and grids, expanded low/high settings, Auto ISO eligibility/ranges, and evidenced capture-mode restrictions without inferring photons, conversion gain, read noise, or saturation from the ISO number. A binder carries those constraints into #99 while keeping manual and Auto ISO envelopes distinct. Generic signal-chain profiles map exact ISO/capture-mode states to explicit #14 readout regimes; Good/Better/Best remain convenience mappings to profile IDs rather than real-camera rankings or direct ISO-to-noise equations.
- Completed #14 sensor/RAW closure with deterministic seeded photo/dark shot-noise realization, explicit additional-charge sampling policies, separate electronic read-noise components, evidence-backed conversion-gain regimes, black-level offset, pre-ADC saturation, ADC quantization/digital saturation, native CFA/capture-mode-bound RAW samples, and explicit linear neighborhood reconstruction. Physical storage saturation, pre-ADC clipping, and digital saturation remain separate; scalar physical clamping never claims blooming; ISO never implicitly selects a gain regime; grouped/remosaic modes fail closed without explicit combination math; reconstruction revalidates site/channel identity against the declared CFA and does not claim aliasing/moiré without an adequate pre-sampling optical-frequency model.
- Added #104 generic focus-control with explicit MF, single-AF and continuous-AF policies; renderer-neutral finite/infinity target observations using #103 longitudinal-distance semantics; deterministic ideal-instantaneous AF actuation; explicit idle/acquired/target-lost/locked state; hold-last-focus target-loss behavior with explicit reacquisition; focus lock independent from exposure/metering/WB; and a separate focus-priority/release-priority/balanced capture-gating seam without claiming commercial AF tracking performance.
- Completed #12 sensor readout/shutter closure with exact capture-mode timing profiles, depth-dependent camera-translation/parallax temporal quadrature, and provider-neutral temporal scene-radiance sampling/reduction on the authoritative first-opening-boundary exposure clock. Readout timing remains distinct from exposure timing; unsupported non-uniform schedules fail closed; translation requires metric depth and does not authorize one global homography; camera and subject translation remain separate inputs; per-node radiance uncertainty/evidence is preserved without fabricated aggregate uncertainty.
- Completed the #111 capture-state handoff with `createProductionCaptureSnapshotFromReleaseFrame()`: committed #105 release-frame exposure/focus/automation/timing/seed state and the full resolved #108 white-balance state are validated, frozen, fingerprinted, round-trippable, and surfaced in production-plan capture identity. Legacy direct snapshot construction remains supported.
- Added #134 engine-wide scientific assurance composition with explicit calibrated/approximation/unknown status, required-evidence visibility, quantified/not-quantified/unknown/not-applicable uncertainty states, preservation of existing `CalculationQuality` uncertainty components, and a fail-closed rule against fabricated aggregate uncertainty. #111 production plans and optimized/reference consumer manifests now preserve the same assurance object and include material evidence/uncertainty changes in reproducibility identity.
- Added #135 generic front-of-lens filter transmission with neutral linear, base-10 optical-density, and wavelength-resolved spectral models. Multiple filters compose multiplicatively with preserved component identity/evidence, remain explicitly unpolarized/unbranded, and integrate exactly once into #110 and #111 without changing aperture geometry, working f-number, DOF, or diffraction. Production capture snapshots now preserve the selected filter stack as immutable capture identity.
- Added #108 shooting-time white-balance control and Auto WB foundations over an explicit pre-WB camera-linear RGB domain. Generic profile-owned presets, manual gains, independent CCT+tint intent, clipped-sample-safe custom measurement, deterministic gray-world-style AWB priorities, and AWB lock remain separate from physical scene illumination and #15 render/export color transforms. AWB never reads authoritative scene illuminant metadata as an oracle and resolved WB state never changes exposure, focus, or RAW-like capture data.
- Added #105 deterministic logical release sequencing for single, burst, self-timer, exposure-bracket, and explicit-focus-bracket capture. Generic release capabilities constrain supported drive/bracket modes, maximum frame count/cadence, and inter-frame gap. Scheduling prevents incompatible ordinary-still exposure overlap, derives distinct reproducible per-frame seeds, snapshots base capture state, keeps sensor capture modes separate, and provides an explicit cancellation boundary without conflating WB bracketing with physical multi-exposure capture.
- Completed the generic #100 metering integration seam with reusable generic-body metering capability profiles, explicit metering-profile/mode compatibility assessment, spot/focus-point linkage capability metadata, and end-to-end meter → frozen target → exposure compensation → #99 automatic-exposure tests. Meter target/calibration policy remains owned by the metering profile rather than duplicated into equipment metadata; the controlled relative-light path preserves the -1 EV scene / +1 EV Auto ISO invariant.
- Extended sensor-architecture metadata to schema 0.3.0 with optional evidence-backed `cmos | ccd` technology-family identity. CMOS/CCD remains independent from FSI/BSI, stacking, readout, shutter, CFA, noise, QE, dynamic range, and other behavior; no hidden physics is activated by the metadata. Legacy schema 0.2.0 profiles remain accepted with their original schema identity and never acquire an inferred technology family.
- Added explicit renderer-neutral `FocusPlane` states for finite longitudinal focus distance versus optical infinity. `parseFocusPlane()` keeps JSON/untrusted boundaries fail-closed, while `calculateFocusPlaneImageDistance()` delegates finite focus to the existing Gaussian thin-lens calculation and represents infinity exactly with image distance equal to nominal focal length, zero limiting magnification, and no non-finite/fabricated distance. Existing `focusDistanceM` APIs remain unchanged.
- Extended #111 production composition with immutable temporal-capture input, authoritative local exposure-window evaluation, separate sensor-readout timing, optional pure-rotation temporal quadrature, and renderer temporal-sampling capability checks. Spatial camera rotation and rolling-readout effects now preserve active versus modeled-zero semantics. Exposure/readout clocks remain explicitly unsynchronized unless a later linkage model establishes synchronization. The planner may compute mature temporal foundations while still blocking a requested full temporal image-formation path on uncomposed upstream PSF dependencies rather than bypassing the authoritative graph. Added renderer/reference consumer manifests that project the same finalized semantic plan into interactive-optimized or reference execution roles without changing stage/effect identity, temporal sample count, seeds, or physical results.
- Added the first #111 production image-formation composition contract alongside the legacy POC. The new browser-safe plan separates prepared static context from immutable per-capture snapshots, expands required stage dependencies from the authoritative image-formation graph, records active/modeled-zero/omitted/unsupported/blocked stage and effect states, declares renderer capabilities and capability mismatches explicitly, and provides structured blockers instead of silent fidelity degradation. The first composed physical path consumes #85 scene-radiance samples plus #110 optical throughput to produce pre-sensor-stack spectral irradiance. Prepared contexts, capture snapshots, and plans are cloned/frozen and carry deterministic canonical FNV-1a reproducibility fingerprints; the fingerprint is explicitly non-cryptographic. The legacy POC remains unchanged.
- Added #110's primary optical radiometry bridge from validated outgoing scene spectral radiance to pre-sensor-stack sensor-plane spectral irradiance. The bridge uses an explicit paraxial circular-pupil acceptance term, one mutually exclusive optical-transmission path (wavelength-resolved transmission or an effective working-T-stop approximation), optional field throughput applied exactly once, explicit finite-focus working-f-number semantics, and exact wavelength-basis preservation. It stops before PSF redistribution, distortion-area correction, sensor optical stack/microlens/CFA/QE, stray light, polarization, volumetrics, or wavelength-changing behavior. Numeric spectral curves require reusable/Photivra-owned provenance; calibrated optical data cannot promote the current approximation-only #85 scene-radiance result into a calibrated sensor-irradiance claim.
- Added final #99 Bulb/Time exposure-duration control and cross-mode hardening. Fixed-duration, Bulb, and Time controls now resolve to a concrete positive elapsed duration before physical integration; unfinished Bulb/Time controls remain active and cannot enter the #12 exposure-window pipeline. Resolved control duration binds only the authoritative seconds-valued nominal exposure duration while preserving caller-selected shutter mechanism/boundary schedules and explicitly refusing to infer tripod support, stabilization state, long-exposure noise reduction, or temperature behavior. Long durations are not capped at a universal 30 s. Added invariants proving equal fixed/Bulb/Time durations produce identical exposure windows and identical resolved aperture/shutter/ISO values produce identical downstream relative exposure regardless of shooting mode.
- Expanded #99 with Program Auto and Full Auto exposure plus a shared versioned generic program-line policy. Program-line nodes declare optical exposure stops relative to the explicit reference exposure together with aperture/shutter pairs; resolution validates physical consistency, interpolates aperture/shutter in log2 space, applies #109 capability/grid constraints, and reports endpoint/quantization residuals. Program Auto supports manual or Auto ISO; Full Auto exposure always resolves aperture+shutter+ISO but explicitly does not resolve autofocus, white balance, flash, drive, scene recognition, or stabilization policy. Generic program lines are approximation/product policy, not named-camera emulation or physical law.
- Expanded #99 with a larger priority-mode group: Aperture Priority + Auto ISO, Shutter Priority + manual ISO, and Shutter Priority + Auto ISO. Two-auto-axis behavior is now explicit product policy rather than hidden physics. A+Auto ISO uses minimum selectable ISO until a declared slowest-preferred shutter, then raises ISO; the policy explicitly chooses whether to allow slower shutter after ISO maximum. S+Auto ISO uses minimum ISO with aperture-first selection, then Auto ISO fills remaining exposure. Shutter Priority with manual ISO resolves aperture only. All paths reuse the same #100 target, #109 capability envelope, reference exposure anchor, quantization rules, and signed residual diagnostics.
- Added the next #99 resolver slice: Aperture Priority with manual ISO. Aperture and ISO remain caller-owned; shutter is the only automatic axis. The resolver reuses the same typed #100 meter target, explicit relative reference exposure anchor, and #109 capability envelope as Manual/Auto ISO. Continuous shutter ranges resolve the ideal duration directly; discrete grids quantize in log2 duration space with the shorter shutter on an exact tie. Shutter min/max and grid quantization produce explicit signed residual-stop diagnostics. No-signal targets block automatic shutter without fabrication.
- Added the first #99 exposure-mode resolver slice for Manual exposure with either manual ISO or Auto ISO. Aperture and shutter remain caller-owned and are never changed; manual ISO is preserved exactly after capability validation, while Auto ISO resolves only the ISO axis from the typed #100 meter target and #109 capability envelope. Relative target scale is normalized through an explicit reference exposure anchor rather than a hidden ISO-100 assumption. Discrete ISO values use nearest-log2 quantization with a lower-ISO tie break; ISO limits produce explicit residual under/over-target diagnostics. Unsupported/unknown Auto ISO and no-signal targets block Auto ISO without fabricating a setting.
- Added the first generic #109 equipment-capability foundation for exposure control. Versioned Photivra body profiles now declare evidence-backed shutter-duration and ISO ranges/grids plus distinct supported/unsupported/unknown Auto ISO capability; generic lens profiles declare focal-length range, focal-dependent or constant widest available f-number, narrowest available f-number, and aperture setting grid. A deterministic resolver produces the body+lens exposure envelope at one selected focal length without mutating source profiles or claiming named-equipment emulation. Selected camera state and #99 exposure setting resolution remain separate.
- Added a stable #100→#99 exposure-meter target seam. Spatial or temporal meter results can be frozen into a reusable AE-lock-safe target snapshot; exposure compensation is applied downstream as an absolute stop offset without mutating the meter measurement, and changed compensation requires a new target identity. Positive compensation requests more exposure. No-signal targets remain finite/unresolved, and automatic aperture/shutter/ISO selection remains outside this layer.
- Added the #85→#100 scene-radiance metering bridge plus explicit temporal metering. A derivation profile labels renderer/provider scalar pre-exposure reductions as approximation-only with no calibrated spectral weighting; sample-set creation validates provider, illumination, material, optional temporal-profile, scene-state and capture-time identity. Time-varying metering requires explicit capture times on the shared `first-opening-boundary-phase` reference, and weighted temporal averaging combines linear meter signals under caller-declared positive normalized weights rather than silently averaging stop offsets. Flash/TTL metering, exposure compensation, and automatic aperture/shutter/ISO resolution remain separate.
- Added a renderer-neutral relative pre-exposure metering foundation for #100. Generic multi-zone, center-weighted, spot, and highlight-weighted policies operate on area-weighted linear samples in the physically oriented active capture frame; output crop, tone mapping, display gamma, white balance, sharpening, exposure compensation, and automatic setting resolution remain outside the meter. The meter preserves stable measurement/scene-state identity, returns a finite no-signal state instead of infinite correction, and enforces the controlled invariant that a uniform -1 stop scene-signal change produces a +1 stop shift to the declared relative target.
- Added temporal illumination waveforms and explicit source-waveform↔capture-time registration. Aperiodic flash/pulse and periodic flicker profiles use seconds-based piecewise-linear relative multipliers bound to the existing `first-opening-boundary-phase` capture reference; local exposure integration consumes authoritative exposure-window samples with deterministic midpoint quadrature. Sensor readout timing is never used as an exposure-time proxy, base source magnitude/spectrum remain authoritative, and the layer does not choose exposure settings, apply source magnitude/material transport, calculate scene radiance, or estimate convergence error.
- Added shared continuous spectral-coverage composition plus first-class discrete line-spectrum measures. Continuous participants now intersect explicit air/vacuum support and union interpolation breakpoints without applying spectral values; sensor-response and scene-illumination adapters feed that shared plan. Discrete illumination spectra use normalized wavelength-integrated line weights, distribute broadband source magnitude into integrated per-line quantities, and integrate by summation without inventing a line width or multiplying by dλ. Continuous and discrete paths remain separate, and calibrated absolute line-output claims are still not authorized automatically.
- Added the renderer-neutral scene-radiance provider/material-response boundary. Material profiles distinguish unresolved, RGB/PBR approximation, and wavelength-preserving spectral-data inputs; provider profiles declare spectral/material/visibility/direct/indirect fidelity; evaluation requests bind exact scene/profile/target/time/wavelength identity; results use outgoing spectral radiance in W/m²/sr/nm; and binding validation prevents profile/material/request/result drift without recomputing renderer output. Schema 0.1.0 remains approximation-only at the provider/result level and explicitly does not authorize calibrated radiance, optics/sensor-plane irradiance, photons, fluorescence, volumetric transport, or polarization.
- Added renderer-neutral shared spectral wavelength primitives plus a scene illumination profile for stable point/spot/area/directional/environment source identities, explicit source-specific magnitude units, relative/RGB/blackbody/continuous-spectrum representations, reusable-data provenance, and fail-closed approximation/calibration boundaries. The profile describes illumination only and does not calculate outgoing scene radiance, material response, visibility, indirect transport, fluorescence, volumetrics, polarization, or sensor signal.
- Added `scene-radiance-evaluation` as an explicit image-formation ownership stage between scene projection and lens/pupil evaluation. The stage defines the future seam for outgoing spectral radiance without turning `SceneRadiometry`, source metadata, RGB preview values, or sensor-plane irradiance into interchangeable quantities.
- Added a sensor spectral-response foundation linked to exact color-sampling channel IDs. It supports direct effective external QE, direct effective spectral responsivity in A/W, or explicitly separable channel-filter transmittance × detector EQE; requires reusable rights for embedded numeric curves; uses explicit air/vacuum/unspecified wavelength bases with piecewise-linear interpolation and fail-closed out-of-range behavior; preserves single-condition metadata without inventing angle/temperature/polarization dependence; and keeps spectral integration, photons/electrons, RAW values, and reconstruction separate.
- Added response-breakpoint-aware bounded sensor spectral quadrature. Requested range edges, response-curve knots, and optional caller-supplied continuous-spectrum/optics breakpoints form deterministic midpoint segments with explicit dλ and a maximum subinterval width; response scope/provenance are preserved while response application, source-spectrum integration, photon/electron/current calculation, and RAW output remain separate.
- Added pre-response spatio-spectral irradiance reduction over explicit E_lambda(x,y) samples in W/m^2/nm. The reducer validates exact spatial/spectral profile linkage, caps the Cartesian product, composes normalized AA/aperture spatial measures with dλ, and reports wavelength-integrated spatial-average irradiance plus geometric-aperture incident flux without applying sensor response or temporal exposure.
- Added a sensor-response application compatibility gate. It binds response data to exact color/sampling-aperture/optical-stack identities, validates response reference plane and incident-area normalization, requires explicit spatial response uniformity/separability before post-spatial application, checks declared reference conditions, blocks unresolved wavelength basis, and keeps signal conversion disabled pending a later typed EQE or A/W path.
- Added an evidence-backed sensor-response operating-range gate for instantaneous optical-input linearity. It preserves radiant-power vs irradiance calibration domains, wavelength applicability, reference conditions, uncertainty, and a declared maximum relative nonlinearity criterion while keeping exposure/full-well saturation and downstream electronics linearity explicitly separate.
- Added a photon-energy wavelength-basis foundation using exact SI Planck constant and vacuum light speed. Vacuum wavelengths map directly; air wavelengths require an exact-wavelength sourced phase refractive index plus explicit atmosphere compatibility, and refractive-index uncertainty is preserved without falsely claiming uncertainty propagation.
- Added typed EQE/filter×detector-EQE instantaneous electron-rate conversion. The converter validates structural and operating-range authorization, requires explicit spatial linear superposition and per-spectral-bin operating-range applicability, binds response evidence and evaluated bin inputs to the exact pre-response reduction, converts each wavelength-bin power contribution to photon rate with the photon-energy foundation, applies effective QE per wavelength, and returns expected electron rate without temporal integration.
- Tightened the operating-range gate so wavelength-dependent rate conversion now fails closed unless both geometric-aperture linear superposition and per-spectral-bin input applicability are explicitly established. Broadband-only range evidence remains diagnostic but cannot authorize EQE/A-W conversion.
- Added typed A/W spectral-responsivity conversion from per-wavelength geometric-aperture radiant power to detector-terminal photocurrent magnitude. The path requires the same structural/spatial/per-bin operating gates as EQE plus an explicit electrical applicability profile for detector bias and current-readout loading; transimpedance, voltage, temporal charge, saturation, noise, ADC and RAW remain downstream.
- Added local sensor-rate/exposure-window binding. Engine-produced EQE and A/W rate results now preserve source color-site identity; the binding validates the exact site channel, requires an evidenced one-to-one color-site/native-effective-raster relationship, recomputes the local shutter window at the mapped native sample center, and deliberately leaves constant-rate temporal integration unauthorized.
- Added evidence-bound constant-rate temporal integration for exact local exposure windows. EQE rates become fractional expected photon/electron counts; A/W photocurrent becomes charge magnitude in coulombs without carrier inference. Results remain photo-signal-only and explicitly cannot authorize full-well or camera-saturation assessment.
- Added dark-current charge accumulation for the EQE electron-count path. Dark current is explicitly pre-compensation thermal electron generation in e-/s, can use exact-reference temperature or fail-closed piecewise-linear measured temperature tables, and does not infer a universal exponential temperature law or dark-current nonuniformity.
- Added accumulated stored-charge composition and completeness assessment. Photo and dark expected electrons plus explicitly incremental additional stored-electron contributors are rebound to one exact local exposure; only an evidence-backed all-material-contributors completeness declaration authorizes later physical full-well assessment.
- Added physical charge-storage capacity assessment against complete expected stored electrons. Capacity is explicitly distinct from camera saturation/digital clipping, remains bound to sensor site/operating state/temperature applicability, and reports expectation-vs-capacity without clamping, blooming, overflow redistribution, or stochastic saturation claims.
- Added camera signal saturation-capacity assessment in dark-corrected photo-generated electron-equivalent units. The comparison deliberately excludes dark/other stored charge, does not reuse physical full-well capacity, and does not infer which analog/digital stage limits the camera response.
- Added exact canonical response-channel data binding from spectral quadrature through spatio-spectral reduction. EQE and A/W converters now reject numeric calibration-curve drift even when profile IDs and evidence references are unchanged; the binding is an exact data-identity mechanism, not a cryptographic integrity checksum.

### Changed

- Engine API contract advances to `0.97.0`; production image-formation plan contract advances to `0.5.0`; scientific-assurance contract remains `0.1.0`; production capture snapshot advances to `0.3.0`; production plan consumer manifest remains `0.1.0`; image-formation contract remains `0.4.0`; Exposure Mode Resolver remains `0.5.0`; Exposure Duration Control remains `0.1.0`. The composed POC remains `0.20.0`; package version remains `0.6.0` until the next public release.

## 0.6.0 - 2026-09-29

### Added

- Added a standalone native-sensor readout scan timing foundation with separately evidenced seconds-valued capture data-readout duration and rolling spatial-sampling skew, native scan direction, active-capture support, pointwise native phase diagnostics, and independent mechanical/EFCS/electronic shutter-mechanism metadata. The first model is explicitly a uniform-linear single-axis approximation and does not infer physical readout lines from the effective image raster.
- Added a standalone capture exposure-window timing foundation with independent opening/closing boundary schedules, simultaneous or uniform-linear native scans, explicit mechanism-derived boundary actuators, evidence-backed timing/direction declarations, full-active-region positive-duration validation, and local exposure-window diagnostics relative to the first opening-boundary phase. Sensor readout remains a separate contract.
- Added a capture-rotation exposure trajectory foundation that maps native sensor points into the reference image plane and evaluates the existing pure-rotation camera model at each point's local exposure start/end. It preserves exposure-window and rotation provenance, excludes sensor readout timing, and explicitly stops short of claiming a rolling-shutter warp or integrated blur kernel.
- Added an analytic inverse pure-camera-rotation mapping plus an instantaneous capture-scan inverse mapping at an explicitly selected local-exposure phase. The capture mapping uses destination-native timing, reports native/oriented effective-sample displacement, does not clamp reference rays outside the active frame, and intentionally avoids iterative solving, sensor-readout coupling, and finite-exposure blur claims.
- Added an evidence-backed readout/exposure spatial-linkage assessment for declaring normalized native scan-phase relationships between rolling sensor readout and electronic exposure boundaries. It supports same/reversed spatial phase, preserves evidence-backed seconds facts, reports cadence ratios, and explicitly does not infer absolute temporal synchronization from shutter mechanism, scan direction, equal timing spans, or total data-readout duration.
- Added deterministic pure-rotation temporal quadrature over each destination point's local exposure window. The first model uses uniform midpoint nodes, preserves the #65 instantaneous inverse mapping as the geometry source of truth, reports both normalized time-average weights and seconds-valued integration measures, and deliberately does not calculate radiance, a blur kernel, or a geometry-only integration error estimate.
- Added the first capture-mode profile/resolution contract with orthogonal acquisition sequence, per-frame sampling, optional evidence-backed inter-frame sensor offsets, reconstruction stages, processed-image raster, and downstream dependency declarations. Grouped sampling preserves unknown vs charge-domain vs pre-conversion-analog vs post-conversion-digital combination semantics; processed/output resolution never mutates physical sensor identity or permits photosite-count inference.
- Added the first exact color-sampling topology contract. It supports monochrome and arbitrary periodic mosaics on an abstract native sensor sampling-site lattice, preserves sensor-anchored repeat phase, allows arbitrary semantic channel IDs without implying spectral calibration, and represents layered color as structural-only until per-layer spatial sampling is modeled. It intentionally does not bind color-sampling sites to `NativeImageRaster` or physical photodiodes.
- Added an evidence-backed native-effective-raster ↔ color-sampling-site-grid binding plus capture-mode structural-source resolution. The bridge binds one exact native effective raster to regular color-site blocks, requires separately evidenced grouped-mode phase, preserves absolute CFA phase, reports compact source rectangles and exact channel-site counts, keeps pixel-shift offsets from changing CFA assignment, and fails closed for declared-effective or layered relationships that are not explicitly mapped.
- Added a sensor optical-stack foundation that separates ordered physical stack-component metadata from effective anti-aliasing spatial response. Effective AA response may be explicitly absent, present-but-unresolved, or an arbitrary normalized point-splitting kernel in native sensor physical coordinates; microlens and cover/filter-stack presence remain descriptive until later angular/spectral/refraction models exist. Unknown AA response remains distinct from documented absence.
- Added a sensor sampling-aperture foundation that explicitly registers the color-site lattice in native sensor physical space and describes a first geometric photosensitive aperture as an optional uniform axis-aligned rectangle. Site pitch/origin and aperture geometry carry separate evidence, unresolved aperture stays fail-closed, geometric fill fraction is diagnostic only, and AA, microlens redistribution, charge diffusion/crosstalk, spectral response, QE, optical throughput, radiometric collection area, and physical photodiode truth remain outside the model.
- Added deterministic sensor spatial-sampling quadrature that combines the resolved geometric aperture with effective AA point splitting using inverse source mapping. It returns native-physical midpoint nodes, separate normalized-average and square-micrometre area measures, preserves destination CFA channel semantics, retains off-imaging-area pre-AA support without clamping/renormalization, and deliberately does not produce optical-field values, photons/electrons, RAW samples, or reconstruction.
- Added sensor spatial-sample reduction for explicitly identified quadrature-node values. It supports nonnegative relative-linear irradiance proxies and physical sensor-plane irradiance in W/m², preserves node identity independently of input ordering, returns normalized spatial averages plus geometric area integrals/incident flux, and keeps CFA spectral response, temporal integration, QE, noise, ADC, RAW code values, and reconstruction separate.

### Changed

- Engine API contract advances to `0.47.0`. The composed POC remains `0.20.0`; the engine can now reduce explicitly identified nonnegative linear spatial samples in either relative or physical irradiance domains without claiming CFA spectral filtering, temporal exposure, sensor conversion, or RAW output.

### Fixed

- Hardened npm package-surface validation so every relative module re-exported by the built root `dist/index.js` must also be present in the packed tarball; added previously missing public `capture`, `composition`, `equipment`, and new `color` dist directories to the package whitelist.


- Radial-distortion invertibility validation now uses scale-normalized, cancellation-resistant stationary-point solving so near-linear high-order profiles cannot hide an interior fold; unsafe derived normalized radii and malformed/sparse batch points fail closed as scientific input errors.
- Reverse image-plane coordinate mapping now uses a physical-scale floating-point edge tolerance instead of a fixed normalized-UV tolerance.

### Performance

- Inverse radial mapping resolves exact identity and mapped-boundary cases directly and stops deterministic bisection once IEEE-754 bounds can no longer narrow.
- The image-formation benchmark now warms and amplifies measured work, alternates scalar/batch ordering, reports paired median ratios, remains informational-only, and avoids a duplicate CI build.

## 0.5.1 - 2026-09-26

### Fixed

- Inverse radial distortion now tolerates only floating-point-scale overshoot at the validated mapped operating boundary and clamps the solver target to that boundary, preventing exact limiting coordinates from failing because of one-ULP polynomial rounding while keeping materially out-of-envelope destinations fail-closed.

## 0.5.0 - 2026-09-26

### Added

- `calculateInverseRadialDistortionMappings()` and `calculateInverseLateralChromaticAberrationMappings()` for multi-point inverse field sampling with one profile-validation/provenance boundary per batch; scalar APIs remain unchanged.
- `mapOrientedPhysicalUvToImagePlanePoint()` and `mapImagePlanePointToOrientedPhysicalUv()` for explicit round-trip conversion between normalized oriented physical raster regions (+Y down) and the pre-orientation optical image plane (+Y up), preserving all four capture orientations and asymmetric/off-axis bounds.

### Changed

- Engine API contract advances to `0.34.0`. The composed POC remains `0.20.0`; this release adds standalone coordinate and batch lens-field APIs without composing lens-field effects into the POC.

## 0.4.0 - 2026-09-25

### Added

- `getImageFormationContract()` and `IMAGE_FORMATION_CONTRACT_VERSION` defining public scientific ownership domains, coordinate spaces, hard stage dependencies, cross-stage couplings, temporal semantics, renderer warp/alpha/occlusion rules, and reserved sensor/reconstruction ordering.
- Explicit effect placement for focus breathing, distortion, lateral chromatic aberration, illumination/mechanical vignetting, non-circular diffraction, field-dependent PSF effects, time-parameterized camera rotation, rolling readout, CFA/photosite sampling, sensor statistics, and reconstruction.
- `calculateCameraRotationImageMapping()` for field-position-dependent, time-parameterized pure camera rotation using exact axis-angle integration of constant pitch/yaw/roll angular velocity.
- `calculateFocusBreathingProjection()` and `calculateFocusBreathingFieldOfView()` for an explicit caller-declared projection scale at the selected focus state, without mutating physical focal length or inventing a lens-specific breathing curve.
- `calculateRadialDistortionMapping()` plus `calculateInverseRadialDistortionMapping()` for generic optical-axis-centered radial field mapping with explicit normalization radius, declared operating envelope, and fail-closed monotonicity/invertibility validation.
- `calculateLateralChromaticAberrationMapping()` plus its inverse for green-reference channel field mapping: one common base distortion plus red/blue coefficient offsets, deterministic per-channel source sampling, and physical separation diagnostics.
- `calculateIlluminationVignetting()` for generic radial field-dependent linear throughput with full-envelope extrema validation, positive stop-loss reporting, and a strict separation from pupil/PSF vignetting.
- `getPsfFoundationContract()` and `calculatePsfFoundationComponents()` for explicit field/depth/wavelength/pupil context plus separately preserved geometric-defocus and circular-diffraction diagnostics, with future pupil/field contributions reserved but not implemented.

### Changed

- Engine API contract advances to `0.32.0`. The image-formation contract remains `0.2.0`; the new PSF/pupil foundation formalizes already-partial field/PSF ownership without changing composed POC semantics. The composed POC remains `0.20.0`.

### Fixed

- Tightened final output-raster aspect validation so only nearest-integer rounding from one isotropic scale is accepted; fixed-percentage tolerance no longer permits visible anisotropic stretching.
- Calculation-quality validation now fails closed on unknown runtime uncertainty `kind` and `source` values instead of treating unknown discriminants as valid metadata.

### Documentation

- Added the image-formation contract guide and synchronized architecture, physics, motion, API-style, and agent guidance around partial-order/coupled-stage semantics and reserved sensor stages.
- Documented the physical camera-rotation sign/axis conventions, field-dependent mapping, and compatibility boundary with the legacy stabilization-equivalent approximation.
- Documented the declared-scale focus-breathing model, its zero-breathing compatibility case, and the prohibition on inferring real-lens behavior from focal/focus metadata.
- Documented radial distortion normalization, forward/inverse mapping, operating-envelope monotonicity, and the boundary excluding tangential/decentered and named-lens behavior.
- Documented lateral CA as channel-dependent field mapping rather than RGB blur, including the non-spectral/non-CFA calibration boundary.
- Documented illumination vignetting as scene-linear/channel-linear throughput only, including full-envelope validity checks and the boundary excluding mechanical/pupil vignetting and PSF/bokeh changes.
- Added the PSF/pupil foundation guide, preserving defocus and circular diffraction as separate diagnostics and reserving future pupil clipping, non-circular diffraction, field curvature, aberration, and bokeh contributions without claiming a combined PSF.

## 0.3.0 - 2026-09-25

### Added

- `calculateSensorGeometryMetrics()` plus `SensorImagingArea` and `NativeImageRaster`, separating physical imaging geometry from native effective image resolution while deriving diagonal 35 mm crop factor, megapixels, and independent X/Y sampling pitch.
- Explicit provenance assumptions that prevent geometric sample spacing from being treated as photosite active area or photon-collection area.
- `resolveCaptureGeometry()` with invariant native sensor coordinates, active capture rectangles, physical camera orientation, digital output crop, and final output raster separation.
- `calculateActiveCaptureFieldOfView()`, which reuses the canonical field-of-view model and preserves diagonal FOV across 90° orientation changes.
- `calculateImagingAreaMetrics()` as the shared diagonal crop-factor primitive for physical imaging areas.
- `calculateEquivalentFocalLength35Mm()`, keeping physical focal length authoritative while deriving conventional diagonal-based 35 mm equivalence from the active physical capture area.
- `parseSensorArchitectureProfile()` plus evidence-backed independent metadata axes for illumination, stacking/integration, readout capabilities, and color-sampling family.
- `calculateFieldOfViewBounds()` for asymmetric/off-center sensor-plane angular bounds.
- Exact native↔oriented raster point/vector/rectangle transforms for all four physical camera rotations.
- `RasterDimensions` as the generic active/output raster contract while `NativeImageRaster` remains the semantic native-raster alias.
- Off-center active-capture optical-axis offsets/bounds, asymmetric FOV, and dual diagonal-corner angular spans.
- Output-raster aspect-ratio validation that rejects implicit geometric stretching.
- `calculateOutputFieldOfView()` plus explicit physical final-output bounds and output resampling scale.
- `parseRadiometryReadinessProfile()` and `assessRadiometryReadiness()` for explicit scene/optics/photosite/exposure/sensor-response prerequisite gating before any future photon simulation.

### Changed

- Engine API contract advances to `0.25.0`.
- Composed POC simulation API advances to `0.20.0`, preserving legacy requests while completing staged capture orientation/active/output geometry, final-output FOV, capture-mode viewing CoC, orientation-aware subject framing, and explicit output sampling scale.
- The composed POC exposes shared sensor-geometry metrics while retaining backwards-compatible representative pitch fields.
- Capture-geometry mode continues to reject stacking legacy `crop.factor` with staged capture, while subject framing and equivalent-viewing CoC now use explicit staged output/viewing semantics.
- The composed POC continues to expose X/Y sample pitch diagnostics and rejects sensor geometry whose X/Y geometric pitch differs by more than 1% until all pixel-domain calculations are axis-aware.
- Unreleased sensor-architecture schema advances to `0.2.0`: source origin and reuse rights are independent, scalar facts accept multiple evidence records, and each readout capability carries its own evidence.
- `InvalidConfigurationError` now lives in the core dependency layer and remains re-exported from the existing public surface.
- Radiometry readiness distinguishes `not-ready`, `approximate-only`, and `calibrated-ready`; assessment never enables composed photon output by itself.

### Documentation

- Synchronized human and agent guidance with the post-0.2 sensor/capture foundations, evidence/reuse-rights model, radiometry readiness gate, independent API-version surfaces, composed-POC integration boundary, and coordinate/sampling invariants.

## 0.2.0 - 2026-09-21

### Added

- `calculateRelativeRenderedExposure()`, a deterministic relative rendering relation that combines aperture/shutter optical exposure with nominal ISO gain relative to declared reference settings.
- Public input and result types for the relative rendered exposure calculation.

### Documentation

- Added usage guidance and scientific limitations for relative rendered exposure.
- Synchronized package, lockfile, README, and citation version metadata for the release.

## 0.1.0 - 2026-09-20

- Initial public release of the Photivra engine package.
