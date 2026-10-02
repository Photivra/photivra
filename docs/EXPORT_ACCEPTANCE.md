# Simulated Sensor RAW DNG / JPEG acceptance

This record separates implemented export behavior, reproducible independent
checks and external application acceptance for #16. The files are synthetic
Photivra captures, never photographs from a physical commercial camera.

## Current implemented boundary

`simulateEnvironmentSensorRawFrame()` executes supplied analytic environment
queries through the existing optics, wavelength/EQE, local temporal exposure,
dark/charge/capacity, seeded shot/read noise and ADC pipeline. Its exact native
post-ADC CFA frame feeds `createPhotographicExportPair()` and the shared #112
processed path. The serializer does not reconstruct the sensor simulation.
Attached manual RAW fixtures remain valid low-level serializer inputs, but are
not the evidence used here for producer-origin acceptance.

Provider transport, visibility, calibration and complete production-stage
activation are explicitly unverified. Source evaluation and authoritative
sensor-code production are executed; these are different claims. Broader
physical integration remains #178 and tier/science ownership, not an invented
property of a DNG file. Child diagnostics remain accessible in the engine result.

The public export API requires explicit profiles, WB/rendering policy, identity,
workflow and event time. It copies validated data before asynchronous hashing.
The commercial app and calling runtime own file downloads. There is no file IO,
wall-clock sampling, service, new runtime dependency, Adobe SDK or competing
writer in the engine.

## Reproduce the acceptance files

```sh
node scripts/generate-producer-export-acceptance.mjs OUTPUT_DIRECTORY
python scripts/verify-producer-export-acceptance.py OUTPUT_DIRECTORY
```

The generator uses the existing repository dev compiler to compile only its
entry point and imported engine/owned fixture modules in a disposable directory.
It cleans that directory on success or failure. It is not an engine dependency
or package export. Run from a checkout with its normal dev dependencies installed.
The Python verifier requires independently installed Pillow, lxml and LibRaw.
Missing required independent tooling is a failure, not a passing skipped check.

Five 72×48 native pairs are committed in
`test/fixtures/producer-export-acceptance/`: landscape, both portrait directions,
inverted landscape and manual WB. Each represents an explicitly identified
shutter event with distinct artifact IDs; the controlled cases use the same seed
and physical/noise inputs, so orientation and metadata-WB variations preserve
all native codes and RAW-data identity. Portrait JPEGs are 48×72, upright JPEG
orientation is 1, and DNG retains native 72×48 pixels with its orientation tag.

These are explicit #130-derived camera/exposure/seed/units variants. The source
is an owned three-zone analytic angular environment at 400–500 nm, not the
canonical Lambertian target or a measured calibration. Optical transmission,
EQE, uniform aperture response, absent AA/PSF and direct noiseless source
radiance remain named approximations. Physical sampling uses square 500 µm
pitch, a declared 0.8×0.6-pitch sensitive aperture, one aperture midpoint and
one shutter midpoint, with two spectral nodes. Each capture executes 6,912
provider queries. This is bounded reference evidence, not native camera pixel
pitch, high-resolution output, measured accuracy or convergence evidence.

The actual generated samples include signed-noise shadows below BlackLevel 64,
physical clipping and ADC clipping at WhiteLevel 1023. Original RAW integers,
not an RGB screenshot or later tone curve, supply the DNG. The manual-WB case
changes AsShotNeutral and JPEG development, while preserving those RAW codes.
The manifest records exact file SHA-256, RAW-data identity, expected codes/RGB,
producer model/version/query count, clipping counts and bounded elapsed/heap
observations. Regeneration can change incidental measurement fields; image
samples/file hashes remain deterministic for the pinned engine/policy.

## Independent checks

The optional verifier uses Pillow's TIFF directory reader and independent strip
unpacking for exact RAW codes; Pillow decodes JPEG and standard EXIF. DOM/Expat
and lxml/libxml2 independently agree on XMP attributes. LibRaw's documented
opaque-handle C API opens, unpacks and renders every DNG, independently verifies
native dimensions/white code and reads camera-neutral WB gains. Its emitted
PPM is decoded by Pillow to verify all oriented output dimensions.

LibRaw API reference: https://www.libraw.org/docs/API-C.html. No LibRaw source,
private structure layout or version-dependent pointer offset is incorporated.
Its version is recorded in `independent-validation.json`. Different demosaic,
tone or display algorithms are not expected to produce pixel-identical images.

Standard capture metadata agree across DNG/JPEG; shared CaptureID/hash remain
separate from per-resource IDs and native RAW-data identity. Privacy checks
reject false camera/GPS/serial/host/creator/AI assertions through the existing
strict metadata contract and verify selected forbidden tags are absent in files.
Advanced noise hints, calibration matrices/signatures, rights fields and original
RAW-resource lineage are omitted when no justified mapping exists. See
[photographic export](PHOTOGRAPHIC_EXPORT.md) and
[capture metadata](CAPTURE_EXPORT_METADATA.md) for the existing field contract.

## Supported sizes and memory semantics

All existing stage limits remain unchanged: the reference producer,
reconstruction and full-native export path permit at most **4,096 native sites**.
The structural attachment ceiling alone does not authorize image execution.
No 24/45/60 MP export, streaming or resampling is claimed. A tiny output crop
cannot evade full-native counting. See [RAW frame envelope](RAW_FRAME_ENVELOPE.md)
and its complete-edge regression tests.

The generator also records 24/45/60 MP unsupported-size preflight requests with
an empty site payload. They reject before any provider invocation or large image
allocation. These are measured rejections with deliberately unsupported/missing
coverage, not typical-resolution memory/performance benchmarks. Before/after
heap is not peak memory; measured timings are informational. The explicit
bounded support declaration satisfies #16's supported-limit option without
claiming high-resolution processing or silently raising safety budgets.

## Closure map

| Requirement | Implementation / evidence | Status |
| --- | --- | --- |
| True native post-ADC CFA RAW; exact lossless codes; effective ADC/black/white consistency; no baked processing | `sensor-raw-producer.test.ts`, `raw-output-conformance.test.ts`, producer-derived files and independent verifier | Implemented / independently checked |
| RAW directly from simulated capture; ISO/gain upstream; same-capture standalone JPEG | `environment-raw-integration.test.ts`, `raw-output-conformance.test.ts`, generated producer pairs | Implemented / bounded origin evidence |
| Shared capture/provenance/hash; distinct resource/RAW IDs; truthful Photivra EXIF/XMP/IPTC | `capture-export-metadata.test.ts`, `photographic-export.test.ts`, independent file inspection | Implemented / checked |
| No generative-AI, real-camera, GPS/serial/host/path or fabricated creator/rights claims | Strict input projection and existing negative tests; generated file inspection | Implemented / checked |
| Native CFA phase, active/default crop, aspect and all orientations | `photographic-export.test.ts`, four generated orientations and LibRaw rendered dimensions | Implemented / checked |
| As-shot WB metadata does not rewrite RAW; virtual color interpretation is explicit | `photographic-export-correction.test.ts`, same-code manual-WB case and LibRaw neutral-gain interpretation | Implemented / approximate color basis |
| Deterministic fixture/code/critical metadata acceptance | Committed manifests, hashes and independent TIFF/JPEG/XML/LibRaw verification | Checked |
| Size/memory boundary and optional runtime/package surface | Existing 4,096-native-site envelope, unsupported-size records, browser/package gates | Explicit supported limits |
| Adobe RAW interpretation plus independent RAW reader | LibRaw passes; Adobe application unavailable in this environment | **External Adobe check pending** |
| JPEG independent decoder/editor/browser acceptance | Pillow decoder passes; Adobe/editor and browser review not recorded | **External editor/browser check pending** |
| Provenance/license review | Existing Apache/DNG notices, owned fixtures and no new dependency; AI-assisted contribution | **Owner review/DCO pending** |
| Accurate simulated-RAW documentation | This record and existing metadata/export/frame documentation | Prepared for owner review |

## External checklist

Download the five pairs from the repository or use the generated directory.
Record application/version and the tested file hashes in
`external-review.template.json`. In Adobe Camera Raw/Lightroom:

1. Open the DNGs successfully. Verify Photivra identity, native 72×48 data and
   displayed 72×48 landscape / 48×72 portrait frames without format errors.
2. Verify manual-WB interpretation differs as declared, and exposure/WB controls
   remain usable. Native codes must remain unmodified. Do not compare Adobe's
   default pixels to Photivra's JPEG as if their processing algorithms were equal.
3. Open the JPEGs in an image editor and browser. Verify decoding, dimensions and
   orientation, readable Photivra metadata and no unsupported-image errors.

This is a required external evidence gate, not a request to install/buy Adobe
software. If no authorized Adobe environment is available, #16 stays open until
that requirement is fulfilled or the owner explicitly revises its scope.
Implementation work and available automated checks can proceed unattended;
substantive review and contribution-specific DCO precede merge.
