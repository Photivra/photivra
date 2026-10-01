# Capture export metadata foundation (#16B)

`createCaptureExportMetadataPair()` is a browser-safe, deterministic **semantic metadata projection**, not an image exporter or proof of RAW/JPEG pixel derivation. Both future writers consume its single shared object; each resource has a distinct caller-owned document UUID and saved-incarnation UUID. `imageDataPairing = "not-verified"` prevents metadata agreement being mistaken for image agreement.

The existing committed capture must already have a non-nil RFC-variant UUID CaptureID. Existing opaque-ID captures remain valid for all earlier APIs, but must be created with a UUID to enter this new export boundary; the exporter does not silently replace their identity. UUIDs normalize to lowercase. All five IDs (capture, two resources, two incarnations) must differ, including after case normalization. The engine neither creates randomness nor proves global uniqueness. Preserve document IDs across reserialization of a resource; give a new saved incarnation its own instance ID. Reuse the capture's ID for the same shutter event. New shutter events require caller-owned new capture IDs.

The input contains `capture`, `workflow`, `capturedAtUtc`, `raw: { documentId, instanceId }`, and `jpeg: { documentId, instanceId }`. The event time is a supplied valid canonical UTC timestamp with three millisecond digits, e.g. `2026-10-01T19:00:00.123Z`. Missing time is rejected: no wall-clock read occurs. The existing scene-clock seconds remain a separate semantic value; file-save/metadata-edit timestamps are not supplied or inferred here.

Only two explicit non-generative workflows are supported:

- `human-directed-non-generative` maps to the IPTC `digitalCreation` concept URI.
- `fully-procedural-non-generative` maps to `algorithmicMedia`.

Classification is caller-declared workflow metadata, not an independent investigation of upstream media. AI-generated, sampled-source, or composite workflows are outside this first policy and require reviewed expansion; do not silently label them with these choices. No `digitalCapture`, AI-specific fields or physical camera claims are emitted. IPTC is the primary semantic reference: [Digital Source Type vocabulary](https://cv.iptc.org/newscodes/digitalsourcetype/), [digitalCreation](https://cv.iptc.org/newscodes/digitalsourcetype/digitalCreation), [algorithmicMedia](https://cv.iptc.org/newscodes/digitalsourcetype/algorithmicMedia). These are references to concept identifiers, not incorporated third-party implementation or calibration data.

Known exposure settings, finite/infinity focus, active-area diagonal 35-mm focal equivalence, native/oriented/output geometry, scene-state identity/time, noise seed/model, resolved WB intent, and model provenance are projected from the parsed immutable capture. Models retain their existing scientific status and public evidence. No model is inferred to be a sensor/lens calibration profile simply because it appears in this list.

Software/creator-tool identity is `Photivra <captured engine API version>`, with explicit `engineApiVersion`; this is not an npm-distribution-version claim. Make/model are `Photivra` / `Photivra Virtual Camera`. Photivra is not automatically the human creator or rights holder. The result omits source bytes and float planes, private paths/hostnames/GPS/serials, invented lens identity, creator/rights, commercial IDs, RAW-data digests, simulation hashes, format calibration and false physical FileSource/SceneType claims.

Geometry is preserved semantically, not packed into EXIF orientation. DNG native samples versus an already-oriented JPEG require different format-specific orientation handling; writers must not rotate twice. This slice does not serialize timestamps, ISO rational/integer tags, focal equivalence rounding, XMP namespace packets, or EXIF identifier representations.

The result is copied/frozen without freezing caller-owned IDs. Repeated projection of identical capture/workflow/time/IDs is identical. It has no runtime dependencies, external I/O or mutable-clock/randomness dependency.

Remaining #16 gates: authoritative same-RAW reconstruction/pairing through #112, stable virtual-sensor DNG interpretation/model identity, canonical reproducibility representation + SHA-256, distinct RAW-data identity/digests, complete Photivra XMP 1.0 mapping, optional DNG/JPEG writers, independently decoded samples/metadata, external editor interoperability, and supported-resolution/memory evidence. C2PA #165 consumes the future complete metadata contract and remains post-V1.
