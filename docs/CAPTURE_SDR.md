# Capture-to-SDR adapter

> **Release context.** This page was written for package 1.2.0 (root API 1.2.0) and has not been re-reviewed for later releases. The [changelog](../CHANGELOG.md) describes the current release. Model and subsystem version numbers on this page, and any dated records, are separate from the package version. See also the [developer guide](DEVELOPERS.md) and the [1.2.0 release contract](RELEASE_1_2_0.md).

For the current, integrated picture, see [processed camera output](PROCESSED_OUTPUT.md). It documents the shared preview and export path, and the explicit post-RAW activation in plan 0.6.0. This page describes the original adapter and keeps its original scope.

## What it does

`calculateCaptureSdr()` connects the authoritative `SimulatedCapture` and colour contracts to the existing SDR (standard dynamic range) renderer.

Versions: adapter schema `0.1.0`; root API advanced to `0.98.0`. The existing capture, colour and SDR schemas, the production plan, and the package and POC versions did not change.

## Choosing the colour path

- **`already-transformed`:** for a plane that is exactly the `linear-srgb-d65` profile and version, in RGB channel order, with a D65 encoding white.
- **`transform`:** hands an explicitly chosen XYZ or ideal-camera colour and white-balance (WB) operation to `calculateCaptureColorTransform()`.

Rules:

- Derived plane and state IDs must be new.
- No WB estimator runs.
- WB that is only an intent is rejected. A state where WB has already been applied cannot be transformed again.
- Applied RGB gains and adopted-white adaptation stay separate. XYZ diagonal adaptation is still an approximation, including in the adapter's result record.

## Input limits

- The input is an inline, co-sited, three-channel plane, of no more than 262,144 samples.
- Its raster binding, dimensions, reference-white value and source identity are kept.
- External or oversized planes fail. They are not loaded, truncated, downsampled or silently tiled.
- The adapter does no geometric resampling.

## Result

The result exposes the optional colour and SDR calculation records separately, together with the original capture saturation, dynamic-range history and noise-realisation identity.

- Rendering exposure, tone and gamut clipping cannot rewrite the physical capture.
- SDR's own saturation field stays `not-consumed`. The original capture saturation is a separate upstream diagnostic; it is never inferred from output codes.
- Display adaptation stays external and unknown.

## Scope

This was one slice (#112B) of the processed-output work, not all of it.

- It does not run correction profiles, and does not turn on production stages.
- Corrected planes can keep their explicit upstream transform history; no correction is inferred.
- Running corrections, and ordered production integration, need their own bound handoffs (see [capture-bound corrections and SDR](CAPTURE_CORRECTED_SDR.md) and [production composition](PRODUCTION_COMPOSITION.md)).
- The file serialiser ([photographic export](PHOTOGRAPHIC_EXPORT.md)) must not invent colour, WB or quantisation meaning.

The implementation and fixtures are independently written, and only orchestrate existing Photivra APIs. No new equation, calibration, third-party material, dependency, service, IO or cost is added.

For external megapixel master images already in resolved linear sRGB/D65, see the separate [bounded native SDR contract](NATIVE_CAPTURE_SDR.md). The reference limits above are unchanged.
