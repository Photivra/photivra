# Reference RAW frame compatibility

A valid RAW attachment does not establish readiness for reconstruction or paired
export. The limits below apply to the current browser-safe reference adapters,
not a typical-camera-resolution production implementation. Count full native
sites before cropping; a small active area or output view never reduces that
count for producer/reconstruction admission.

| Boundary | Inclusive budget | Additional conditions |
| --- | --- | --- |
| `parseSensorRawFrameInput()` / `createSensorRawFrame()` | 65,536 full native sites | Dense row-major uint16 attachment; single-frame native-effective periodic CFA; explicit one-site binding and consistent codes/flags |
| `parseSensorRawProducerInput()` / `simulateSensorRawFrame()` | 4,096 full native sites | Complete per-site exposure/charge/readout declarations and existing noise/seed identities; upstream radiometry remains declared |
| `parseRawFrameReconstructionInput()` / `resolveRawFrameReconstruction()` | 4,096 full native sites | Native in-frame region; at most 64 CFA phases, 16 output channels and 256 contributions per phase profile; complete phase dispatch |
| `parsePhotographicExportInput()` / `createPhotographicExportPair()` | Inherits the 4,096 full-native-site reconstruction budget | Registered 2×2 RGB Bayer; ordered RGB reconstruction channels; 1:1 oriented crop/output sampling; reconstructed region covers the native final crop |
| Corrected paired export | Same full-native budget | Reconstruction covers the entire active native area, even when the final output crop is smaller; existing correction support/selection rules still apply |
| Internal baseline JPEG encoder | 4,096 output pixels | Its independent output/encoder budget; not the definition of native sensor coverage |

The attachment and reference execution budgets have distinct internal constants
in `src/capture/raw-frame-limits.ts`. Producer and reconstruction share the latter
because they admit the same full-native execution envelope. The JPEG output
budget retains its separate meaning even though its current numeric value is
the same. No safety limit is raised to make adjacent APIs appear identical.

For example, a complete 64×65 attachment can be structurally valid, but its 4,160
native sites exceed the reference reconstruction/producer budget even with a
2×2 active/output crop. A 64×64 frame is within the inclusive 4,096-site budget;
that fact alone does not supply missing kernel support or calibrated color.

## Preflight and compatibility

Call the existing stage parser before execution to discover incompatible
requests. Parsers revalidate untrusted data and can copy/validate native records;
this is not a constant-time dimensions-only capability query. Reconstruction
rejects oversized sample arrays before creating an attachment snapshot. Export
now rejects unsupported output resampling, uncovered final crop, incomplete
active coverage for correction, and non-Bayer topology during parsing, before
per-pixel reconstruction, rendering, hashes or file encoding. Bayer preflight
requires exactly one red, two green and one blue site; an extra channel is
rejected here rather than failing later during DNG packing.

These are necessary structural gates, not a promise that execution succeeds.
Kernel edge/source-channel support, DNG repeating black/common-white metadata,
color-neutral validity, correction support and metadata encoding constraints
retain their execution checks. Missing edge support still fails without
padding, clipping or renormalization.

Compatibility review: previously executable requests retain the same accepted
envelope, arithmetic, codes, hashes and bytes. The public export parser now
rejects these already-unsupported execution combinations earlier; when several
faults coexist, error precedence can change. Existing diagnostic text is kept.
No serialized field, schema or root API version changes, and no saved-data
migration is required. Package and POC versions remain independent and unchanged.

Larger/streaming execution, resolution/memory/performance measurement, external
editor acceptance and authoritative upstream origin remain tracked by #16/#112
and defect #178. This envelope work does not close those production gates.
