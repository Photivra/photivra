# Paired DNG/JPEG reference export

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
  profiles, region, color/scene profiles, WB policy, rendering and JPEG step.
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
This repository-only optional checker adds no engine dependency. The manifest
records elapsed time and before/after heap usage for the tiny fixture only;
these are not peak-memory measurements or high-resolution evidence.

Supplemental local checks use Pillow's independent TIFF-directory reader plus
direct strip unpacking for exact RAW codes; Pillow decodes JPEG/EXIF and extracts
XMP, and Python DOM parses both packets. Diverse 1×1, 7×8, 9×13 and 64×64 patterns
decode at steps 1, 7 and 255; measured step-1 maximum channel error is ≤2 codes.
Pillow cannot render the CFA photometric profile. These checks do not establish
RAW-editor color agreement or two independent metadata-reader acceptance.

Before closing #16, validate outputs in Adobe Camera Raw/Lightroom and an open
RAW processor; compare crop/orientation/WB/color and privacy/identity metadata;
complete human provenance/DCO review; exercise the production RAW producer;
and resolve typical-resolution memory/performance and resampling support. The
API explicitly reports editor validation pending. Issue #16 remains open.

Format references and DNG patent-license notice are recorded in `THIRD_PARTY.md`
and `NOTICE`. No Adobe SDK or external encoder source is incorporated.
