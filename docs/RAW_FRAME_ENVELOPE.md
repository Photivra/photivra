# Reference RAW frame compatibility

> **Release context.** This page was written for package 1.2.0 (root API 1.2.0) and has not been re-reviewed for later releases. The [changelog](../CHANGELOG.md) describes the current release. Model and subsystem version numbers on this page, and any dated records, are separate from the package version. See also the [developer guide](DEVELOPERS.md) and the [1.2.0 release contract](RELEASE_1_2_0.md).

This page lists the size limits and requirements for each RAW-frame stage.

A RAW attachment that is valid does not mean it is ready for reconstruction or paired export. The limits below apply to the current browser-safe reference adapters. They are not a production implementation for typical camera resolutions.

**Count full native sites before cropping.** A small active area, or a small output view, never reduces the site count used to decide whether the producer or reconstruction will accept a frame.

| Boundary | Inclusive budget | Additional conditions |
| --- | --- | --- |
| `parseSensorRawFrameInput()` / `createSensorRawFrame()` | 65,536 full native sites | Dense row-major uint16 attachment; single-frame native-effective periodic CFA; explicit one-site binding and consistent codes/flags |
| `parseSensorRawProducerInput()` / `simulateSensorRawFrame()` | 4,096 full native sites | Complete per-site exposure/charge/readout declarations and existing noise/seed identities; upstream radiometry remains declared |
| `parseRawFrameReconstructionInput()` / `resolveRawFrameReconstruction()` | 4,096 full native sites | Native in-frame region; at most 64 CFA phases, 16 output channels and 256 contributions per phase profile; complete phase dispatch |
| `parsePhotographicExportInput()` / `createPhotographicExportPair()` | Inherits the 4,096 full-native-site reconstruction budget | Registered 2×2 RGB Bayer; ordered RGB reconstruction channels; 1:1 oriented crop/output sampling; reconstructed region covers the native final crop |
| Corrected paired export | Same full-native budget | Reconstruction covers the entire active native area, even when the final output crop is smaller; existing correction support/selection rules still apply |
| Internal baseline JPEG encoder | 4,096 output pixels | Its independent output/encoder budget; not the definition of native sensor coverage |

**Why the limits are separate.** The attachment limit and the reference execution limit are separate internal constants in `src/capture/raw-frame-limits.ts`. The producer and reconstruction share the execution limit, because they accept the same full-native execution range. The JPEG output limit keeps its own meaning, even though its current value happens to be the same. No safety limit is raised just to make neighbouring APIs look identical.

**Example.** A complete 64×65 attachment can be structurally valid. But its 4,160 native sites exceed the reference reconstruction and producer limit, even with a 2×2 active or output crop. A 64×64 frame is within the inclusive 4,096-site limit; that alone does not supply missing kernel support or calibrated colour.

## Preflight and compatibility

**Check before you run.** Call the existing parser for a stage before running it, to find incompatible requests early.

- Parsers revalidate untrusted data, and may copy and validate native records. This is not a constant-time query that looks only at dimensions.
- Reconstruction rejects oversized sample arrays before it creates a snapshot of the attachment.
- Export rejects these during parsing, before any per-pixel reconstruction, rendering, hashing or file encoding: unsupported output resampling, a final crop that is not covered, incomplete active coverage when correction is used, and non-Bayer topology.
- The Bayer check requires exactly one red, two green and one blue site. An extra channel is rejected here, rather than failing later while packing the DNG.

**These are necessary, not sufficient.** Passing these structural checks does not promise that execution succeeds. These are still checked during execution:

- kernel support at edges and for source channels;
- DNG repeating-black and common-white metadata;
- validity of the colour neutral;
- correction support;
- metadata encoding constraints.

Missing edge support still fails, with no padding, clipping or renormalisation.

**Compatibility review.**

- Requests that could run before are accepted in the same way, with the same arithmetic, codes, hashes and bytes.
- The public export parser now rejects some combinations earlier that were already unsupported at execution. When several faults occur together, which error is reported first can change. Existing diagnostic text is kept.
- No serialised field, schema or root API version changes, and saved data needs no migration.
- Package and POC versions are independent and unchanged.

**Larger frames.** Larger or streaming execution is still unsupported. The related export, processing and producer work (issues #16, #112 and #178) is closed for its reviewed bounded scope. Current evidence about execution and editors is in [production capture](PRODUCTION_ENVIRONMENT_CAPTURE.md) and [export acceptance](EXPORT_ACCEPTANCE.md). A structurally valid attachment alone does not provide that evidence for a new frame.
