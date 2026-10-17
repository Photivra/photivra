# Capture export metadata foundation

> **Release context.** This page was written for package 1.2.0 (root API 1.2.0) and has not been re-reviewed for later releases. The [changelog](../CHANGELOG.md) describes the current release. Model and subsystem version numbers on this page, and any dated records, are separate from the package version. See also the [developer guide](DEVELOPERS.md) and the [1.2.0 release contract](RELEASE_1_2_0.md).

`createCaptureExportMetadataPair()` builds one shared set of metadata for a capture's RAW and JPEG files (issue #16B). It is browser-safe and deterministic.

It is a **projection of meaning** into metadata. It is not an image exporter, and not proof that the RAW and JPEG pixels come from the same data.

- Both file writers use the single shared object.
- Each file has its own caller-owned document UUID and saved-incarnation UUID.
- `imageDataPairing = "not-verified"` stops matching metadata from being mistaken for matching images.

## Identity

**Capture ID.** The committed capture must already have a CaptureID that is a non-nil UUID of the RFC variant.

- Captures with opaque (non-UUID) IDs are still valid for all earlier APIs. But to use this export step, they must be created with a UUID. The exporter does not quietly replace their identity.
- UUIDs are normalised to lower case.

**Five distinct IDs.** The capture ID, the two file document IDs and the two incarnation IDs must all differ, including after case normalisation. The engine creates no randomness, and does not prove global uniqueness.

**Keeping IDs stable.**

- Keep a file's document ID when you re-save the same file.
- Give each new saved incarnation its own instance ID.
- Reuse the capture's ID for the same shutter event.
- A new shutter event needs a new capture ID, owned by the caller.

## Input

The input contains `capture`, `workflow`, `capturedAtUtc`, `raw: { documentId, instanceId }` and `jpeg: { documentId, instanceId }`.

- The event time is a valid canonical UTC timestamp you supply, with exactly three millisecond digits, for example `2026-10-01T19:00:00.123Z`.
- A missing time is rejected. The engine never reads the wall clock.
- The existing scene-clock seconds stay a separate value.
- File-save and metadata-edit timestamps are not supplied or inferred here.

## Workflow classification

Only two explicit non-generative workflows are supported:

- `human-directed-non-generative` maps to the IPTC `digitalCreation` concept URI.
- `fully-procedural-non-generative` maps to `algorithmicMedia`.

This classification is workflow metadata declared by the caller. It is not an independent investigation of the upstream media.

- AI-generated, sampled-source and composite workflows are outside this first policy, and need a reviewed extension. Do not quietly label them with these choices.
- No `digitalCapture`, AI-specific fields or physical camera claims are written.

IPTC is the main reference for meaning: [Digital Source Type vocabulary](https://cv.iptc.org/newscodes/digitalsourcetype/), [digitalCreation](https://cv.iptc.org/newscodes/digitalsourcetype/digitalCreation), [algorithmicMedia](https://cv.iptc.org/newscodes/digitalsourcetype/algorithmicMedia). These are references to concept identifiers, not third-party implementation or calibration data.

## What is projected

These come from the parsed immutable capture:

- known exposure settings;
- finite or infinity focus;
- 35 mm focal equivalence based on the active-area diagonal;
- native, oriented and output geometry;
- scene-state identity and time;
- noise seed and model;
- resolved WB intent;
- model provenance.

Models keep their existing scientific status and public evidence. A model is never treated as a sensor or lens calibration profile just because it appears in this list.

**Software and camera identity.**

- Software / creator tool is `Photivra <captured engine API version>`, with an explicit `engineApiVersion`. This is not a claim about the npm distribution version.
- Make / model are `Photivra` / `Photivra Virtual Camera`.
- Photivra is not automatically the human creator or the rights holder.

**What is left out.** Source bytes and float planes; private paths, hostnames, GPS and serial numbers; invented lens identity; creator and rights; commercial IDs; RAW-data digests; simulation hashes; format calibration; and false physical FileSource or SceneType claims.

## Geometry and serialisation

Geometry is kept as meaning; it is not packed into EXIF orientation. A DNG stores native samples while a JPEG is already oriented, so each needs its own orientation handling. Writers must not rotate twice.

This step does not serialise timestamps, ISO as rational or integer tags, rounding of focal equivalence, XMP namespace packets, or EXIF identifier representations.

The result is copied and frozen, without freezing the caller's own ID objects. Projecting identical capture, workflow, time and IDs again gives an identical result. There are no runtime dependencies, external I/O, or dependency on a changing clock or randomness.

## Historical status

These were the open requirements when this foundation landed. The current implementation, evidence and external checks are mapped in [Export acceptance](EXPORT_ACCEPTANCE.md).

- authoritative same-RAW reconstruction and pairing (through the processed-output work, #112);
- a stable DNG interpretation and model identity for the virtual sensor;
- a canonical representation for reproducibility, plus SHA-256;
- distinct RAW-data identity and digests;
- a complete Photivra XMP 1.0 mapping;
- optional DNG and JPEG writers;
- independently decoded samples and metadata;
- interoperability with external editors;
- evidence for supported resolutions and memory.

C2PA support (#165) will use the future complete metadata contract, and comes after V1.
