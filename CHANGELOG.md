# Changelog

Notable public changes to `@photivra/engine` are documented here.

## Unreleased

### Added

- `calculateSensorGeometryMetrics()` plus `SensorImagingArea` and `NativeImageRaster`, separating physical imaging geometry from native effective image resolution while deriving diagonal 35 mm crop factor, megapixels, and independent X/Y sampling pitch.
- Explicit provenance assumptions that prevent geometric sample spacing from being treated as photosite active area or photon-collection area.
- `resolveCaptureGeometry()` with invariant native sensor coordinates, active capture rectangles, physical camera orientation, digital output crop, and final output raster separation.
- `calculateActiveCaptureFieldOfView()`, which reuses the canonical field-of-view model and preserves diagonal FOV across 90° orientation changes.
- `calculateImagingAreaMetrics()` as the shared diagonal crop-factor primitive for physical imaging areas.
- `calculateEquivalentFocalLength35Mm()`, keeping physical focal length authoritative while deriving conventional diagonal-based 35 mm equivalence from the active physical capture area.
- `parseSensorArchitectureProfile()` plus evidence-backed independent metadata axes for illumination, stacking/integration, readout capabilities, and color-sampling family.
- `calculateFieldOfViewBounds()` for asymmetric/off-center sensor-plane angular bounds.
- Exact native↔oriented raster point/vector/rectangle transforms for all four physical camera rotations.
- `RasterDimensions` as the generic active/output raster contract while `NativeImageRaster` remains the semantic native-raster alias.
- Off-center active-capture optical-axis offsets/bounds, asymmetric FOV, and dual diagonal-corner angular spans.
- Output-raster aspect-ratio validation that rejects implicit geometric stretching.

### Changed

- Engine API contract advances to `0.22.0`.
- Composed POC simulation API advances to `0.18.0`, exposes X/Y sample pitch diagnostics, and rejects sensor geometry whose X/Y geometric pitch differs by more than 1% until the composed POC is axis-aware.
- Unreleased sensor-architecture schema advances to `0.2.0`: source origin and reuse rights are independent, scalar facts accept multiple evidence records, and each readout capability carries its own evidence.
- `InvalidConfigurationError` now lives in the core dependency layer and remains re-exported from the existing public surface.

## 0.2.0 - 2026-09-21

### Added

- `calculateRelativeRenderedExposure()`, a deterministic relative rendering relation that combines aperture/shutter optical exposure with nominal ISO gain relative to declared reference settings.
- Public input and result types for the relative rendered exposure calculation.

### Documentation

- Added usage guidance and scientific limitations for relative rendered exposure.
- Synchronized package, lockfile, README, and citation version metadata for the release.

## 0.1.0 - 2026-09-20

- Initial public release of the Photivra engine package.
