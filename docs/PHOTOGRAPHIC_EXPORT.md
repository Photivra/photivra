# Simulated Sensor RAW DNG / JPEG export

> **Release context.** This page was written for package 1.2.0 (root API 1.2.0) and has not been re-reviewed for later releases. The [changelog](../CHANGELOG.md) describes the current release. Model and subsystem version numbers on this page, and any dated records, are separate from the package version. See also the [developer guide](DEVELOPERS.md) and the [1.2.0 release contract](RELEASE_1_2_0.md).

This page describes how Photivra writes a simulated sensor RAW as a matched pair of files: a DNG (the raw data) and a JPEG (a rendered view of the same data).

Related pages:

- [Export acceptance](EXPORT_ACCEPTANCE.md) records the current producer-derived files and the external acceptance checks. The reproducible generator uses current typed fixtures; the earlier pinned serializer-only files are kept as history.
- [Reference RAW frame compatibility](RAW_FRAME_ENVELOPE.md) gives the limits for each stage, how full-native sites are counted, and how the parser checks input up front.

## Overview

`createPhotographicExportPair()` is an optional, browser-safe, asynchronous export step.

- Both returned byte arrays come from one RAW input that is revalidated and privately copied.
- The JPEG never uses the capture's separate floating-point image planes.
- Web Crypto SHA-256 is required.
- It adds no dependency on a filesystem, clock, random generator, network or encoder.
- Callers supply public identities and an explicit UTC event timestamp, and are responsible for saving the bytes.

This is a bounded reference implementation, with these requirements:

- The whole native frame contains at most **4,096 sites** (photosites).
- Coverage is complete: one frame, one site per native sample, registered 2×2 RGB Bayer CFA (colour filter array).
- RAW codes stay in native row-major CFA coordinates.
- A fixed repeating black-level tile is required.
- Every sample carries its readout's effective white level, conversion gain and read noise, which are constant per CFA phase.
- Codes below black, and the original saturation codes, are kept as they are. They are not stretched to the 16-bit container limit.

It does not support typical camera resolutions, and it does not establish calibrated camera behaviour.

## Explicit development

**Reconstruction input.** `RawFrameReconstructionInput` supplies complete profiles for each absolute CFA phase, and a native region that covers the final crop. Reconstruction keeps signed black-subtracted values and exact weighted source contributions. Missing support at the edges fails. No automatic kernel, padding, sharpening or denoising runs.

**Colour profile.** `ExportSensorColorProfile` explicitly declares:

- an invertible, normalised 3×3 matrix from camera channels to XYZ/D65;
- numeric evidence that is owned or reusable;
- the profile identity and its limitations.

Only `approximation` status is accepted. RGB or CFA names do not establish primaries, spectral response or calibration. Output kernels must use the declared RGB order and the exact CFA profile. The reference white must map to positive camera-neutral coordinates.

**White balance (WB).** WB is either `not-required` (no captured intent) or `apply-resolved-sensor-gains` (with intent). No second WB estimator runs. The existing SDR rendering handles rendering exposure, named tone mapping, clipping, transfer function and 8-bit quantisation. Clipping during rendering is separate from RAW saturation.

### Development model (2.0: `sensor-color-development` 2.0.0, `processed-sensor-raw-sdr` 0.2.0)

Development reads the attached RAW codes directly through the shared typed kernel (`src/capture/raw-development-kernel.ts`). `createNativeRawDevelopmentTask` uses the same kernel, so the bounded export and packed native development give byte-identical results for the same RAW and policy.

1. **Effective white level.** Each site is normalised as `(code − black)/(W − black)`. `W` is the CFA phase's effective white (full-saturation) code, from `calculateEffectiveSaturationCode`:
   - `I = B + min(C, P)/G`
   - `A = min(Amax, round(I + INL(I)))`
   - `W = min(D, round((A − B)·d + B))`

   Here C is capacity, P pre-ADC saturation, G conversion gain, B black, INL optional integral non-linearity, d optional digital gain, and D digital saturation.

   Previously development divided by the digital full scale D. A sensor that clipped at code 20,512 of 65,535 therefore developed white to 0.31. The new rule follows the DNG 1.7 `WhiteLevel` definition (the fully saturated encoding level) and the EMVA 1288 saturation point.
2. **Saturation handled.** A site whose code reaches `W`, or that carries any saturation flag (physical, pre-ADC or digital), is set to exactly 1 before reconstruction. Signed values below black are kept.
3. **White balance once, for any matrix.** With normalised channels `c`:

   `linear sRGB = X · M · diag(w) · highlight(diag(g) · c)`

   - `M` is the declared camera→XYZ matrix.
   - `X` is XYZ→linear sRGB.
   - `w = M⁻¹·XYZ(D65)`, normalised to green. This is the camera neutral of D65, exactly [1,1,1] (within 1e-12) for white-normalised profiles.
   - `g` is the resolved gains.

   The gains map the scene white to equal channels, and `diag(w)` maps equal channels to D65. So a grey card under the gains' illuminant develops neutral for every invertible `M`. Without an intent, `g = 1/w` and development equals `X·M·c`.

   Before 2.0, the gains were followed directly by `M`. That applied WB twice when `M` was not white-normalised. For example, a D65 grey card with camera neutral [0.45, 1, 0.65] developed to (0.40, 0.18, 0.277).
4. **Highlights** (`highlightMode`, default `clip`).
   - `clip` limits every WB-scaled channel to the smallest gain: the level at which the least-amplified channel saturates. Clipped pixels therefore stay neutral. This is the documented default of dcraw `-H 0` and of common raw converters.
   - `reconstruct` is an approximation defined by this engine. Let `s` be the largest normalised channel and `t = clamp((s − 0.8)/0.2, 0, 1)`. The unclipped WB result `u` is blended toward neutral `n = max_k min(u_k, g_min)`: `(1 − t)·u + t·n`. Below 0.8 of white, the colour is unchanged and unclipped, so channel clipping causes no hue shift. At white, it is neutral. This follows the highlight-desaturation idea of Guo, Cheng & Hu, "Correcting over-exposure in photographs" (CVPR 2010). It does not recover clipped scene signal.

   `highlight` diagnostics report saturated pixels, clipped WB samples and reconstructed pixels.

`source.value.linearPlane` keeps its documented digital-span normalisation for review; development no longer reads it.

**Geometry.**

- Only 1:1 output cropping is supported. The final oriented crop is translated through the active crop to exact native coordinates.
- JPEG pixels are oriented once, and EXIF Orientation is 1.
- The DNG keeps native pixels and records the orientation, native ActiveArea and DefaultCrop.
- Resampling fails closed (is rejected).
- JPEG coding repeats edge pixels only to fill partial 8×8 coding blocks. It does not supply missing reconstruction samples or change the photograph's dimensions.

## Optional correction of the JPEG view

The optional `correction` field reuses the choice contract in [CAPTURE_CORRECTED_SDR.md](CAPTURE_CORRECTED_SDR.md). The order is exact:

1. reconstruction from the attached RAW;
2. resolved camera-channel WB;
3. declared camera-to-XYZ/D65;
4. existing linear-sRGB transform;
5. native-optical geometry / chromatic aberration (CA) / gain correction;
6. SDR;
7. JPEG.

The private intermediate image contains only RGB derived from the RAW. It replaces all the separate float planes for this calculation, and is never returned as a replacement capture. The parent `source` keeps the exact RAW reconstruction, its provenance, site-level physical and digital saturation, and source history. Saturation of the intermediate RGB is explicitly not modelled; no single RGB white level is inferred from the mixed RAW site saturation flags.

**Requirements.**

- Reconstruction of the **full active native area**.
- Square physical pixel pitch.
- 1:1 declared output crop sampling.
- The exporter supplies no prefilter, so `resampler.antialias` must be `none`. Maps that need compression filtering fail through the existing executor. The exporter cannot claim a prefiltered input or quietly create a filter.

Correction state uses the native output dimensions, the exact committed optics and the exposure-local time, independent of scene time. Profiles are generic declarations for the linear-sRGB basis after colour and WB. They are not physical CA calibration for sensor channels. The pipeline does not redraw noise, blur or photons, and does not turn on reserved production stages.

**Invalid support.** `invalidSupport` either rejects unavailable samples, or chooses the existing largest jointly valid rectangle.

- `processedOutputView.rect` records that rectangle in the full oriented output raster. Its dimensions are used by the JPEG SOF marker and EXIF. It is relative to the declared output crop, not to the active or native sensor origin.
- The DNG's native codes, ActiveArea and original DefaultCrop do not change. A non-linearly corrected JPEG cannot be represented by moving an uncorrected RAW crop.
- So the two files share the exact capture and source codes, but their processed geometry can differ. Physical focal equivalence still belongs to the capture.

**Metadata.** The result exposes the processed `correction` calculation and a separate `rawCorrectionIntent` plan with application `metadata-only`.

- Custom XMP in both files records CorrectionProfileID/version, CorrectionSelectionKind/selections, ProcessedOutputRect and ProcessedIlluminationClippingEvents.
- CorrectionDisposition is `informational-intent-only` in the DNG and `processed-view` in the JPEG.
- This metadata is informational. It is not standardised DNG opcodes, and it does not promise that editors will apply the profile.
- Gain clipping events are counted before joint cropping, and stay separate from RAW saturation and SDR gamut clipping.
- The full profile and choices go into SimulationHash. RawDataUniqueID still depends only on the exact RAW codes.
- Omitting correction keeps the original rendering and hash inputs, and writes no correction XMP.

This addition keeps export schema 0.1.0.

## Files and metadata

### DNG

The DNG uses little-endian TIFF, DNGVersion 1.4.0.0 (backward version 1.1.0.0), one uncompressed 16-bit CFA strip, CFA/black/white tags, an inverse XYZ-to-camera ColorMatrix1, and D65 CalibrationIlluminant1. Rational values use bounded decimal approximations (maximum denominator 10^9). Values out of range, or nonzero values that would round to zero, fail.

Values written, all from quantities the engine knows (DNG Specification 1.7.1.0):

- **WhiteLevel:** the smallest per-phase effective white level (one value, SamplesPerPixel = 1). So no channel reads as unsaturated above its saturation point.
- **BlackLevel / CFAPattern:** phased from the **ActiveArea** origin, because DNG applies BlackLevelRepeatDim and the CFA pattern to the image after cropping to ActiveArea. Before 2.0, both used the absolute native phase, which is wrong for odd active-area offsets.
- **AsShotNeutral:** the camera neutral of the assumed scene white, `g_green/g` (or the D65 camera neutral `w` when there is no intent). Before 2.0 it was written as `w/g`, which squared the camera white for non-normalised matrices.
- **ForwardMatrix1:** `Bradford(D65→D50) · M · diag(M⁻¹·XYZ(D65))` (the engine's `chromaticAdaptationMatrix`). It maps white-balanced camera [1,1,1] to the D50 white (Lam 1985 Bradford matrix, as used in the ICC profile connection space).
- **BaselineExposure:** the rendering profile's `renderingExposureEv`, so a raw converter's default rendering matches the paired JPEG's intended exposure.
- **AnalogBalance:** [1,1,1]; the readout model has no per-channel analog WB.
- **NoiseProfile** (DOUBLE, one (S, O) pair per CFAPlaneColor plane): with `x = (code − black)/(WhiteLevel − black)`, `var(x) = S·x + O`, where `S = 1/(G·span)` and `O = (σ²/G² + 1/12)/span²`. G is the per-channel conversion gain (e⁻/DN), σ the read noise (e⁻), and the 1/12 term is uniform ADC quantisation. Photo and dark shot noise are Poisson (variance = mean electrons). PRNU, DSNU and fixed-pattern noise are not modelled and not included. It is written only when every phase of a channel has the same gain, read noise and black level; otherwise it is omitted.

AsShotNeutral records development intent; it does not change RAW codes. No preview, compression, opcodes, calibration signature, RawImageDigest or NewRawImageDigest is claimed. XMP `RawPipelineVersion` and `ProcessedPipelineVersion` record `PHOTOGRAPHIC_EXPORT_PIPELINE_VERSION` (0.2.0).

### JPEG

The JPEG is baseline sequential 8-bit YCbCr 4:4:4. It uses an explicit constant quantisation step from 1 to 255, an analytical DCT, custom canonical Huffman tables and byte stuffing.

- Each coefficient is the direct 64-term sum, added up in a fixed order. Row products are shared across vertical frequencies without changing the order of the sum, because a factored row/column DCT changes rounded coefficients (and so bytes) for a small fraction of blocks.
- The step is not a manufacturer's quality scale. JPEG is still lossy at step 1.

**Encoder version 2** (`EXPORT_JPEG_ENCODER_ID` = `photivra-baseline-jpeg-444-v2`, engine 2.0.0) makes the bytes independent of the JavaScript engine, and fixes the rounding policy:

- **Fixed cosine table.** The 64 DCT cosines C(u,x) = cos((2x+1)uπ/16) come from a fixed table of correctly rounded binary64 constants (`JPEG_DCT_COSINES`). They were computed offline with 130-digit decimal arithmetic (Gauss–Legendre π and a Taylor series), and checked so that no neighbouring double is closer to the exact value.
  - Version 1 used runtime `Math.cos` of the rounded argument `(2x+1)·u·Math.PI/16`. That differs from the exact cosine in 43 of 64 entries by an ulp or two (units in the last place), and differs between V8 and JavaScriptCore in 2 entries.
  - So a coefficient whose exact value is a half-integer can round differently than in version 1. For example −19.5 now gives −20, where V8's table gave −19.499999999999996 and so −19.
  - The table keeps the exact symmetries C(u,7−x) = (−1)^u C(u,x).
  - JPEG bytes from a 1024 × 1024 corpus at steps 1, 2, 3, 4 and 8 are identical under Node (V8) and Bun (JavaScriptCore).
- **Symmetric rounding.** Quantised coefficients round to nearest, with ties **half away from zero** (−2.5 → −3), so positive and negative coefficients round the same way. Version 1 used `Math.round`, which sends −2.5 to −2.
- **Growing buffer.** The output buffer starts at 64 KiB and doubles up to the caller's byte budget, instead of being allocated and zero-filled at the full budget. A 384-byte JPEG with a 256 MB budget no longer commits 256 MB or blocks for about 130 ms in `finish()`. The budget limit itself is unchanged.

Version 1 and 2 bytes differ only where a coefficient before rounding is within about an ulp of a half-integer, or is exactly a negative half-integer.

- `test/export-jpeg-byte-identity.test.ts` proves the optimised encoder equals a straightforward version-2 reference on randomised corpora.
- `test/export-jpeg-v2.test.ts` checks the table, the rounding and the buffer budget.

JFIF and EXIF ColorSpace=1 declare rendered sRGB. The DNG is unclassified and carries the explicit virtual-camera matrix.

### EXIF

EXIF records exposure, aperture, focal length, the rounded 35mm equivalent when it can be represented, dimensions, UTC event time with subseconds and offset, and ImageUniqueID.

- A selected integer virtual ISO ≤65535 is recorded as RecommendedExposureIndex, with SensitivityType=REI. This is a simulation setting, not a measured ISO speed or a standard-output-sensitivity calibration.
- Make/Model identify Photivra's virtual camera, not a commercial device.

Exif 2.32 (CIPA DC-008-2019, Tables 17–18) also makes these tags mandatory for a compressed primary image: IFD0 XResolution, YResolution, ResolutionUnit and YCbCrPositioning, and Exif FlashpixVersion and ComponentsConfiguration. Since 2.0.0, the paired-export JPEG writes them through `packExportJpegExif` (shared with the Print JPEG), using the standard's defaults:

- 72/1 dpi with ResolutionUnit 2. This is the Exif value for an unknown resolution, not a print size; JFIF keeps units 0.
- YCbCrPositioning 1 (centred).
- FlashpixVersion `0100`.
- ComponentsConfiguration Y Cb Cr.

Only the APP1 Exif segment changes. Pixels, entropy-coded data and SimulationHash do not.

### XMP

- XMP contains a separate xmpMM DocumentID/InstanceID and IPTC DigitalImageGUID for each file, the caller's chosen non-generative IPTC workflow type, and the namespace `https://photivra.com/ns/simulation/1.0/`.
- SceneID/version are public profiles declared by the caller, bound to the capture's sceneStateId.
- SensorProfileID identifies the export colour interpretation.
- SceneTime is simulation seconds, not wall-clock time.
- A finite focus distance is recorded; infinity never becomes a fake number.
- Private paths, GPS, serial numbers and unsupported rights, calibration or AI fields are rejected.

## Identity and lineage

- **SimulationHash** is SHA-256 over sorted, finite, canonical JSON containing the whole RAW frame (including capture identity, history and float planes), phase profiles, region, colour and scene profiles, WB policy, rendering, JPEG step, highlight mode, pipeline version and the optional correction choice. The save timestamp and artifact IDs are excluded. Changes to history can change the hash without changing decoded pixels.
- **RawDataUniqueID** is the first 128 bits of SHA-256 over versioned native dimensions, CFA layout, the 16-bit container declaration and the exact codes. It is not a standard RawImageDigest.
- **UniqueCameraModel** includes the public colour profile identity and version, and its full hash. A profile change therefore cannot quietly keep the same family identity.
- **File SHA-256** fields hash the exact returned bytes at creation.
- **Pairing.** The top-level pairing records that the JPEG was generated from the exact attached RAW. The nested metadata-only `imageDataPairing="not-verified"` keeps its earlier meaning. Where the upstream producer came from is still declared by the caller and unverified. Hashes are not signatures, C2PA or tamper-proof attestations.

Returned arrays are owned by the caller and can be modified; hashes describe the bytes at creation. The reconstruction and rendering calculation records stay available for review.

## Use and acceptance

```ts
import { createPhotographicExportPair, parsePhotographicExportInput,
  type PhotographicExportInput } from "@photivra/engine";

async function exportCommittedRaw(input: PhotographicExportInput, signal?: AbortSignal) {
  return createPhotographicExportPair(parsePhotographicExportInput(input), signal ? { signal } : {});
}
```

`createPhotographicExportPair(input, { signal })` checks the optional `AbortSignal` before work and after every hash. On abort it rejects with "Photographic export aborted." and returns no partial pair. If `crypto.subtle` is missing, it fails before any work with a domain error. Browsers expose Web Crypto only in secure contexts (HTTPS or localhost); Node.js 22+ provides it.

Callers supply real committed input and explicit profile evidence. Test profiles are synthetic and are not suggested physical calibrations.

### Generating and checking acceptance files

1. Run `npm run build`.
2. Run `node scripts/generate-photographic-export-fixtures.mjs OUTPUT_DIRECTORY`.
3. With Pillow installed, run `python scripts/verify-photographic-export-fixtures.py OUTPUT_DIRECTORY`.

This optional checker lives only in the repository and adds no engine dependency. It also uses lxml and LibRaw when they are installed, and reports any skipped checks explicitly. A 2×2 strip regression file and a 64×64 owned greyscale chart are generated, each with its own capture and artifact identity. The manifest records elapsed time and heap usage before and after each bounded fixture. These are not peak-memory measurements, and not evidence for high resolutions.

**What the checks cover.**

- Pillow's independent TIFF-directory reader, plus direct strip unpacking, recovers the exact RAW codes.
- Pillow decodes the JPEG and EXIF and extracts XMP; Python DOM parses both XMP packets.
- Varied 1×1, 7×8, 9×13 and 64×64 patterns decode at steps 1, 7 and 255. The measured maximum channel error at step 1 is ≤2 codes.
- Pillow cannot render the CFA photometric profile.
- LibRaw 0.21.2 independently opens, unpacks and processes the 64×64 DNG, keeping the native 64×64 size and WhiteLevel=1023. It rejects the 2×2 file as unsupported; that tiny file is a strip/tag regression fixture, not an editor acceptance file.
- XMP attributes in both files are decoded and compared independently through DOM/Expat and lxml/libxml2.

These checks do not establish Adobe acceptance, exact agreement between different demosaic or rendering algorithms, or full schema-aware XMP conformance.

Concrete 64×64 files are checked in to `test/fixtures/paired-export-acceptance/` for external review. Their owned synthetic ramp codes exercise the serialiser, not the physical sensor producer. See that folder's README for hashes and the exact remaining acceptance steps. No commercial-camera calibration is used.

### External editor acceptance

Export (issue #16) was closed through PR #201. [Export acceptance](EXPORT_ACCEPTANCE.md) records:

- producer-derived file pairs;
- independent LibRaw, TIFF, JPEG and XML checks;
- the owner's Lightroom screenshots of orientation, as-shot settings, exposure and WB;
- review of a landscape JPEG in Photoshop and Chrome, with the unverified hashes and builds from the user's Mac explicitly kept.

The per-call API still returns `independent-decode-required-editor-validation-pending`. It cannot vouch that arbitrary newly generated bytes were checked in an external editor. That conservative result field does not describe the current issue status.

Format references and the DNG patent-licence notice are in `THIRD_PARTY.md` and `NOTICE`. No Adobe SDK or external encoder source is included.

## Internal ownership

- `src/color/sensor-color-development.ts` owns the declared sensor-channel gain → camera-to-XYZ → linear-sRGB calculation and its well-conditioned inversion.
- Export keeps profile and evidence validation, CFA binding, the one-time WB authorisation, geometry, and the DNG/JPEG container mapping.
- The adapter uses validated data. It does not infer sensor calibration, and does not reuse the separate ideal virtual-camera input contract.

Version 2.0.0 of that model changes WB, white level and highlight handling, as documented above.
