# Native sensor RAW frame attachment

> **Release context.** This page was written for package 1.2.0 (root API 1.2.0) and has not been re-reviewed for later releases. The [changelog](../CHANGELOG.md) describes the current release. Model and subsystem version numbers on this page, and any dated records, are separate from the package version. See also the [developer guide](DEVELOPERS.md) and the [1.2.0 release contract](RELEASE_1_2_0.md).

See [Reference RAW frame compatibility](RAW_FRAME_ENVELOPE.md) for the limits of each stage, how full-native sites are counted, and how parsers check input up front.

## What it does

`createSensorRawFrame()` attaches RAW sensor samples (`SensorRawCaptureSample` values) to one immutable [simulated capture](SIMULATED_CAPTURE.md). `parseSensorRawFrameInput()` validates this attachment when it comes from untrusted input.

Versions: schema `0.1.0`, introduced at root API `0.98.0`. The package, POC, capture and production contracts did not change. The attachment is merged, and the current root API is 1.0.1.

## What is accepted

This first version accepts single-frame, native-effective capture modes with:

- an explicitly evidenced binding of one site per native sample;
- a periodic mosaic (CFA) topology.

**Rules.**

- The whole native frame must be supplied, in native row-major order, one sample per site.
- Absolute CFA phase, site and channel assignment, capture-mode, profile and readout identity, and every per-site seed are kept.
- RAW samples are never rotated, cropped, demosaiced, white-balanced or tone-mapped.
- Active-capture and output geometry stay in the attached metadata. They never reset the CFA phase.

## Codes

- The 16-bit container holds integer RAW codes without re-quantising them.
- Black and digital-saturation codes are per-site metadata, with a positive span between them.
- Codes below black are kept; their black-subtracted normalised values can be negative.
- A code cannot exceed its declared digital maximum.
- Stored codes and normalisation must agree exactly with the existing sensor formula.
- Physical and digital saturation flags stay separate.

This does not infer ADC bit depth, physical full well, a spectral camera colour matrix or calibrated sensor behaviour.

## What validation proves

The frame's `producerBinding` is explicitly `caller-declared-capture-attachment`.

- Validation proves the data is structurally consistent.
- It does not prove that a caller actually ran the engine, or that any supplied linear planes were reconstructed from these RAW samples.
- Before claiming a paired JPEG, consumers must use a real same-capture producer and reconstruction handoff.
- The attachment does not render pixels, does not create RAW by masking RGB, and does not certify DNG or editor interoperability.

## Limits

- Structural attachment is limited to 65,536 native samples. Reference execution by the producer, reconstruction and export is limited to 4,096.
- External storage, streaming or high-resolution writers, grouped, remosaiced, layered or multi-frame modes, and other RAW packings each need their own explicit contract.
- A new frame copies and freezes every record; arrays owned by the caller can still be changed.
- This conservative reference implementation validates every site's binding. It makes no memory or performance claim at 24, 45 or 60 MP.

## Status at introduction

This was a prerequisite step of the export work (issue #16). Remaining work then included:

- canonical export metadata and pairing;
- DNG tag, colour and white-balance mapping, and review of the specification and patent notice;
- an optional writer;
- same-RAW reconstruction through the processed-output work (#112);
- standalone JPEG encoding;
- independent decoding and Adobe acceptance;
- measured memory limits.

TIFF or Linear DNG cannot replace the required pair of a genuine RAW DNG plus a standalone JPEG. C2PA (#165) stays after V1.

The implementation and structural fixtures were written independently. Fixtures contain declared synthetic code records. They are not a sensor calibration, and not evidence that RAW and RGB agree numerically. No new dependency, third-party material, IO, service or cost is added.
