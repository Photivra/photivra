# Simulated Sensor RAW DNG / JPEG export

Release context: **package 1.1.0 candidate / root API 1.1.0**. Subsystem/model versions and dated introduction or measurement records below are independent historical identities; they are not distribution versions. See [developer navigation](DEVELOPERS.md) and [release contract](RELEASE_1_1_0.md).

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
coordinates. A fixed repeating black tile and common digital white code are
required. Below-black codes and original saturation codes are preserved without
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
`apply-resolved-sensor-gains` with intent. Existing resolved camera-channel gains
apply once before camera-to-XYZ and the existing XYZ-to-linear-sRGB transform.
No second WB estimator runs. Existing SDR rendering handles rendering exposure,
named tone mapping, clipping, transfer and 8-bit quantization. Rendering clipping
is separate from RAW saturation.

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

DNG uses little-endian TIFF, version/backward version 1.1, one uncompressed
16-bit CFA strip, CFA/black/white tags, inverse XYZ-to-camera ColorMatrix1,
D65 CalibrationIlluminant1 and normalized AsShotNeutral. Rational values use
bounded decimal approximations (maximum denominator 10^9); unsupported range
or nonzero values rounding to zero fail. AsShotNeutral records development intent
and does not alter RAW codes. No preview, compression, opcodes, NoiseProfile,
calibration signature, RawImageDigest or NewRawImageDigest is claimed.

JPEG is baseline sequential 8-bit YCbCr444 with an explicit constant quantization
step 1..255, analytical DCT, custom canonical Huffman tables and byte stuffing.
The step is not a manufacturer's quality scale. JPEG remains lossy at step 1.
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
  profiles, region, color/scene profiles, WB policy, rendering, JPEG step and
  the optional correction choice.
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

async function exportCommittedRaw(input: PhotographicExportInput) {
  return createPhotographicExportPair(parsePhotographicExportInput(input));
}
```

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
virtual-camera input contract. Existing arithmetic order and error policies are
preserved; no public API or schema change is introduced.
