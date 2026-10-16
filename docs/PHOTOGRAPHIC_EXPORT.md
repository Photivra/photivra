# Simulated Sensor RAW DNG / JPEG export

Release context (dated historical note): written for the **package 1.2.0 candidate / root API 1.2.0** and not re-reviewed for later releases; see the [changelog](../CHANGELOG.md) for the current release. Subsystem/model versions and dated introduction or measurement records below are independent historical identities; they are not distribution versions. See [developer navigation](DEVELOPERS.md) and [release contract](RELEASE_1_2_0.md).

Current producer-derived files and external closure gates are recorded in
[Export acceptance](EXPORT_ACCEPTANCE.md). The new reproducible generator uses
current typed fixtures; the earlier pinned serializer-only files remain historical.

See [Reference RAW frame compatibility](RAW_FRAME_ENVELOPE.md) for stage-specific
limits, full-native counting and parser preflight behavior.

`createPhotographicExportPair()` is an optional browser-safe asynchronous export
boundary. Both owned byte arrays come from one revalidated, privately copied RAW
input. The JPEG never uses the capture's independent float planes. Web Crypto
SHA-256 is required. No filesystem, clock, random generator, network or encoder
dependency is added. Callers supply public identities and an explicit UTC event
timestamp, and own saving the bytes.

This is a bounded reference implementation. The entire native frame must contain
at most **4,096 sites**, with complete single-frame, one-site-per-native-sample,
registered 2×2 RGB Bayer coverage. RAW codes remain in native row-major CFA
coordinates. A fixed repeating black tile is required, and every sample carries
its readout's effective white level, conversion gain and read noise, constant per
CFA phase. Below-black codes and original saturation codes are preserved without
stretching to the 16-bit container limit. This does not support typical camera
resolutions or establish calibrated camera behavior.

## Explicit development

`RawFrameReconstructionInput` supplies complete absolute CFA phase profiles and
a native region covering the final crop. Existing reconstruction preserves
signed black-subtracted values and exact weighted source contributions. Missing
edge support fails; no automatic kernel, padding, sharpening or denoising runs.

`ExportSensorColorProfile` explicitly declares an invertible 3×3 normalized
camera-channel-to-XYZ/D65 matrix, owned/reusable numeric evidence, profile
identity and limitations. Only approximation status is accepted. RGB/CFA names
do not establish primaries, spectral response or calibration. Output kernels
must use the declared RGB order and exact CFA profile. The reference white must
map to positive camera-neutral coordinates.

WB is explicitly `not-required` with no captured intent, or
`apply-resolved-sensor-gains` with intent. No second WB estimator runs. Existing
SDR rendering handles rendering exposure, named tone mapping, clipping, transfer
and 8-bit quantization. Rendering clipping is separate from RAW saturation.

### Development model (2.0: `sensor-color-development` 2.0.0, `processed-sensor-raw-sdr` 0.2.0)

Development reads the attached RAW codes directly through the shared typed
kernel (`src/capture/raw-development-kernel.ts`), the same kernel used by
`createNativeRawDevelopmentTask`, so the bounded export and packed native
development are byte-identical for the same RAW and policy.

1. **Effective white level.** Each site is normalized as
   `(code − black)/(W − black)`, where `W` is the CFA phase's effective white
   (full-saturation) code, `calculateEffectiveSaturationCode`:
   `I = B + min(C, P)/G`, `A = min(Amax, round(I + INL(I)))`,
   `W = min(D, round((A − B)·d + B))` (capacity C, pre-ADC saturation P,
   conversion gain G, black B, optional INL and digital gain d, digital
   saturation D). Previously development divided by the digital full scale D, so
   a sensor clipping at code 20,512 of 65,535 developed white to 0.31. This
   follows the DNG 1.7 `WhiteLevel` definition (the fully saturated encoding
   level) and the EMVA 1288 saturation point.
2. **Saturation consumed.** A site whose code reaches `W` or that carries any
   saturation flag (physical, pre-ADC or digital) is set to exactly 1 before
   reconstruction. Signed below-black values are preserved.
3. **White balance once, for any matrix.** With normalized channels `c`,
   `linear sRGB = X · M · diag(w) · highlight(diag(g) · c)`, where `M` is the
   declared camera→XYZ matrix, `X` XYZ→linear sRGB, `w = M⁻¹·XYZ(D65)`
   normalized to green (the camera neutral of D65, exactly [1,1,1] for
   white-normalized profiles within 1e-12) and `g` the resolved gains. Gains map
   the scene white to equal channels and `diag(w)` maps equal channels to D65,
   so a grey card under the gains' illuminant develops neutral for every
   invertible `M`. Without an intent, `g = 1/w` and development equals `X·M·c`.
   Before 2.0 the gains were followed directly by `M`, applying WB twice when `M`
   was not white-normalized (review r1: a D65 grey card with camera neutral
   [0.45, 1, 0.65] developed to (0.40, 0.18, 0.277)).
4. **Highlights** (`highlightMode`, default `clip`). `clip` limits every
   WB-scaled channel to the smallest gain, the level at which the least-amplified
   channel saturates, so clipped pixels stay neutral (the documented default of
   dcraw `-H 0` and of common raw converters). `reconstruct` is an engine-defined
   approximation: with `s` the largest normalized channel and
   `t = clamp((s − 0.8)/0.2, 0, 1)`, the unclipped WB result `u` blends toward
   neutral `n = max_k min(u_k, g_min)`: `(1 − t)·u + t·n`. Below 0.8 of white the
   colour is unchanged and unclipped (no hue shift from channel clipping); at
   white it is neutral. This follows the highlight-desaturation idea of Guo,
   Cheng & Hu, "Correcting over-exposure in photographs" (CVPR 2010); it does not
   recover clipped scene signal. `highlight` diagnostics report saturated pixels,
   clipped WB samples and reconstructed pixels.

`source.value.linearPlane` keeps its documented digital-span normalization for
review; development no longer reads it.

Only 1:1 output cropping is supported. The final oriented crop is translated
through the active crop to exact native coordinates. JPEG pixels receive
orientation once and EXIF Orientation=1. DNG keeps native pixels and records
orientation, native ActiveArea and DefaultCrop. Resampling fails closed. JPEG
coding replicates edges solely to fill partial 8×8 coding blocks; it does not
supply missing reconstruction samples or change photograph dimensions.

## Optional correction of the JPEG view

The optional `correction` field reuses the choice contract documented in
[CAPTURE_CORRECTED_SDR.md](CAPTURE_CORRECTED_SDR.md). Order is exact attached RAW
reconstruction → resolved camera-channel WB → declared camera-to-XYZ/D65 →
existing linear-sRGB transform → native-optical geometry/CA/gain correction →
SDR → JPEG. The private intermediate plane contains only RAW-derived RGB; it
replaces all independent float planes for this calculation and is never returned
as a replacement capture. Parent `source` retains the exact RAW reconstruction,
its provenance, site-level physical/digital saturation and source history.
Intermediate RGB capture saturation is explicitly unmodeled; no scalar RGB white
level is inferred from heterogeneous RAW site saturation flags.

This branch requires reconstruction of the **full active native area**, square
physical pixel pitch and 1:1 declared output crop sampling. The exporter supplies
no prefilter, so `resampler.antialias` must be `none`; maps requiring compression
filtering fail through the existing executor. It cannot claim a prefiltered input
or silently create a filter. Correction state uses native output dimensions,
exact committed optics and exposure-local time, independently of scene time.
Profiles remain generic declarations for the post-color/WB linear-sRGB basis,
not physical sensor-channel CA calibration. The pipeline does not redraw noise,
blur or photons and does not activate reserved production stages.

`invalidSupport` either rejects unavailable samples or chooses the existing
largest joint-valid rectangle. `processedOutputView.rect` records that rectangle
in the full oriented output raster, with dimensions used by JPEG SOF and EXIF.
It is relative to the declared output crop, not the active/native sensor origin.
The DNG's native codes, ActiveArea and original DefaultCrop remain unchanged;
a nonlinear corrected JPEG cannot be represented by moving an uncorrected RAW
crop. These paired files share the exact capture and source codes, while their
processed geometry can differ. Physical focal equivalence remains capture-owned.

The result exposes the processed `correction` calculation and a separate
`rawCorrectionIntent` plan with application `metadata-only`. Custom XMP in both
files records CorrectionProfileID/version, CorrectionSelectionKind/selections,
ProcessedOutputRect and ProcessedIlluminationClippingEvents. CorrectionDisposition
is `informational-intent-only` in DNG and `processed-view` in JPEG. This is
informational metadata, not standardized DNG opcodes or a promise that editors
apply the profile. Gain clipping events precede joint cropping and remain
separate from RAW saturation and SDR gamut clipping. Full profile and choices
enter SimulationHash; RawDataUniqueID still depends only on the exact RAW codes.
Omitting correction preserves the original rendering/hash inputs and emits no
correction XMP. The additive contract retains export schema 0.1.0.

## Files and metadata

DNG uses little-endian TIFF, DNGVersion 1.4.0.0 (backward version 1.1.0.0),
one uncompressed 16-bit CFA strip, CFA/black/white tags, inverse XYZ-to-camera
ColorMatrix1 and D65 CalibrationIlluminant1. Rational values use bounded decimal
approximations (maximum denominator 10^9); unsupported range or nonzero values
rounding to zero fail. Values written, all from engine-known quantities (DNG
Specification 1.7.1.0):

- **WhiteLevel**: the smallest per-phase effective white level (one value,
  SamplesPerPixel = 1), so no channel reads as unsaturated above its saturation.
- **BlackLevel / CFAPattern**: phased from the **ActiveArea** origin, because DNG
  applies BlackLevelRepeatDim and the CFA pattern to the ActiveArea-cropped
  image. Before 2.0 both used absolute native phase, which is wrong for odd
  active offsets.
- **AsShotNeutral**: the camera neutral of the assumed scene white,
  `g_green/g` (the D65 camera neutral `w` without an intent). Before 2.0 it was
  written as `w/g`, the camera white squared for non-normalized matrices.
- **ForwardMatrix1**: `Bradford(D65→D50) · M · diag(M⁻¹·XYZ(D65))`, mapping
  white-balanced camera [1,1,1] to the D50 white (Lam 1985 Bradford matrix, as in
  the ICC profile-connection space).
- **BaselineExposure**: the rendering profile's `renderingExposureEv`, so a raw
  converter's default rendering matches the paired JPEG's exposure intent.
- **AnalogBalance**: [1,1,1]; the readout model has no per-channel analog WB.
- **NoiseProfile** (DOUBLE, one (S, O) pair per CFAPlaneColor plane): with
  `x = (code − black)/(WhiteLevel − black)`, `var(x) = S·x + O`,
  `S = 1/(G·span)`, `O = (σ²/G² + 1/12)/span²` from the per-channel conversion
  gain G (e⁻/DN), read noise σ (e⁻) and uniform ADC quantization. Photo and dark
  shot noise are Poisson (variance = mean electrons). PRNU, DSNU and fixed-pattern
  noise are not modeled and not included. Written only when every phase of a
  channel has the same gain, read noise and black; otherwise omitted.

AsShotNeutral records development intent and does not alter RAW codes. No
preview, compression, opcodes, calibration signature, RawImageDigest or
NewRawImageDigest is claimed. XMP `RawPipelineVersion` and
`ProcessedPipelineVersion` record `PHOTOGRAPHIC_EXPORT_PIPELINE_VERSION` (0.2.0).

JPEG is baseline sequential 8-bit YCbCr444 with an explicit constant quantization
step 1..255, analytical DCT, custom canonical Huffman tables and byte stuffing.
Each coefficient is the direct 64-term sum accumulated in a fixed order; row
products are shared across vertical frequencies without reassociating the sum,
because a factored row/column DCT changes rounded coefficients (and bytes) for a
small fraction of blocks. The step is not a manufacturer's quality scale. JPEG remains lossy at step 1.
JFIF and EXIF ColorSpace=1 declare rendered sRGB; DNG is unclassified and carries
the explicit virtual-camera matrix.

EXIF records exposure, aperture, focal length, rounded 35mm equivalent when
representable, dimensions, UTC event time/subseconds/offset, and ImageUniqueID.
Integer selected virtual ISO ≤65535 is recorded as RecommendedExposureIndex
with SensitivityType=REI: a simulation setting, not measured ISO speed or
standard-output-sensitivity calibration. Make/Model identify Photivra's virtual
camera, not a commercial device.

XMP contains distinct xmpMM DocumentID/InstanceID and IPTC DigitalImageGUID per
file, the caller-selected non-generative IPTC workflow type and the namespace
`https://photivra.com/ns/simulation/1.0/`. SceneID/version are caller-declared
public profiles bound to the capture's sceneStateId. SensorProfileID identifies
the export color interpretation. SceneTime is simulation seconds, not wall-clock
time. Finite focus distance is recorded; infinity never becomes a fake number.
Private paths/GPS/serials and unsupported rights/calibration/AI fields are rejected.

## Identity and lineage

- SimulationHash is SHA-256 over sorted finite canonical JSON containing the
  entire RAW frame, including capture identity/history/float planes, phase
  profiles, region, color/scene profiles, WB policy, rendering, JPEG step,
  highlight mode, pipeline version and the optional correction choice.
  Save timestamp and artifact IDs are excluded. History changes may change the
  hash without changing decoded pixels.
- RawDataUniqueID is the first 128 bits of SHA-256 over versioned native
  dimensions, CFA layout, 16-bit container declaration and exact codes. It is
  not a standard RawImageDigest.
- UniqueCameraModel includes public color profile identity/version and its full
  hash; profile changes cannot silently keep the same family identity. File
  SHA-256 fields hash exact returned bytes at creation.
- Top-level pairing records JPEG generation from the exact attached RAW. Nested
  metadata-only `imageDataPairing="not-verified"` retains its earlier projection
  semantics. Upstream producer origin remains caller-declared/unverified. Hashes
  are not signatures, C2PA or tamper-proof attestations.

Returned arrays are owned and mutable; hashes describe creation-time bytes.
Reconstruction/rendering calculation envelopes remain available for review.

## Use and acceptance

```ts
import { createPhotographicExportPair, parsePhotographicExportInput,
  type PhotographicExportInput } from "@photivra/engine";

async function exportCommittedRaw(input: PhotographicExportInput, signal?: AbortSignal) {
  return createPhotographicExportPair(parsePhotographicExportInput(input), signal ? { signal } : {});
}
```

`createPhotographicExportPair(input, { signal })` checks the optional
`AbortSignal` before work and after every hash, and rejects with
"Photographic export aborted." without returning a partial pair. Missing
`crypto.subtle` fails before any work with a domain error: browsers expose Web
Crypto only in secure contexts (HTTPS or localhost); Node.js 22+ provides it.

Callers supply actual committed input and explicit profile evidence. Test profiles
are synthetic and are not suggested physical calibrations.

Generate concrete acceptance files with `npm run build`, then
`node scripts/generate-photographic-export-fixtures.mjs OUTPUT_DIRECTORY`.
With an existing Pillow installation, run
`python scripts/verify-photographic-export-fixtures.py OUTPUT_DIRECTORY`.
This repository-only optional checker adds no engine dependency. It also uses
existing lxml and LibRaw installations when available, and reports skipped
checks explicitly. Both the 2×2 strip regression and 64×64 owned grayscale
chart are generated with separate capture/artifact identities. The manifest
records elapsed time and before/after heap usage for each bounded fixture;
these are not peak-memory measurements or high-resolution evidence.

Supplemental local checks use Pillow's independent TIFF-directory reader plus
direct strip unpacking for exact RAW codes; Pillow decodes JPEG/EXIF and extracts
XMP, and Python DOM parses both packets. Diverse 1×1, 7×8, 9×13 and 64×64 patterns
decode at steps 1, 7 and 255; measured step-1 maximum channel error is ≤2 codes.
Pillow cannot render the CFA photometric profile. LibRaw 0.21.2 independently
opens, unpacks and processes the 64×64 DNG, retaining the native 64×64 size and
WhiteLevel=1023. It rejects the 2×2 file as unsupported; that tiny file remains
a strip/tag regression fixture, not an editor acceptance file. XMP attributes
in both pair members are independently decoded and compared through DOM/Expat
and lxml/libxml2. These checks do not establish Adobe acceptance, exact
agreement between different demosaic/rendering algorithms or a complete
schema-aware XMP implementation conformance claim.

Concrete 64×64 files are checked into `test/fixtures/paired-export-acceptance/`
for external review. Their owned synthetic ramp codes exercise the serializer,
not the physical sensor producer. See its README for hashes and the exact
remaining acceptance steps. No commercial-camera calibration is used.

#16 is closed through reviewed/signed PR #201. [Export acceptance](EXPORT_ACCEPTANCE.md) records producer-derived pairs, independent LibRaw/TIFF/JPEG/XML checks, owner Lightroom orientation/as-shot/exposure/WB screenshots and landscape JPEG Photoshop/Chrome review, with unverified user-Mac hashes/builds explicitly preserved. The per-call API retains `independent-decode-required-editor-validation-pending`: it cannot attest that arbitrary newly generated bytes were checked in an external editor. That conservative result field is not the current issue status.

Format references and DNG patent-license notice are recorded in `THIRD_PARTY.md`
and `NOTICE`. No Adobe SDK or external encoder source is incorporated.

Internal ownership: `src/color/sensor-color-development.ts` owns the declared
sensor-channel gain → camera-to-XYZ → linear-sRGB calculation and conditioned
inversion. Export retains profile/evidence validation, CFA binding, one-time WB
authorization, geometry and DNG/JPEG container mapping. The adapter consumes
validated data and does not infer sensor calibration or reuse the distinct ideal
virtual-camera input contract. Version 2.0.0 of that model changes WB, white
level and highlight handling as documented above.
