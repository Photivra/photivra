# Changelog

Notable public changes to `@photivra/engine` are documented here.

## Unreleased

### Added

- `getImageFormationContract()` and `IMAGE_FORMATION_CONTRACT_VERSION` defining public scientific ownership domains, coordinate spaces, hard stage dependencies, cross-stage couplings, temporal semantics, renderer warp/alpha/occlusion rules, and reserved sensor/reconstruction ordering.
- Explicit effect placement for focus breathing, distortion, lateral chromatic aberration, illumination/mechanical vignetting, non-circular diffraction, field-dependent PSF effects, time-parameterized camera rotation, rolling readout, CFA/photosite sampling, sensor statistics, and reconstruction.
- `calculateCameraRotationImageMapping()` for field-position-dependent, time-parameterized pure camera rotation using exact axis-angle integration of constant pitch/yaw/roll angular velocity.
- `calculateFocusBreathingProjection()` and `calculateFocusBreathingFieldOfView()` for an explicit caller-declared projection scale at the selected focus state, without mutating physical focal length or inventing a lens-specific breathing curve.
- `calculateRadialDistortionMapping()` plus `calculateInverseRadialDistortionMapping()` for generic optical-axis-centered radial field mapping with explicit normalization radius, declared operating envelope, and fail-closed monotonicity/invertibility validation.
- `calculateLateralChromaticAberrationMapping()` plus its inverse for channel-dependent red/green/blue field mapping and deterministic per-channel source sampling, with pairwise physical separation diagnostics.

### Changed

- Engine API contract advances to `0.30.0`. The image-formation contract remains `0.2.0`; lateral CA fills another standalone lens-field mapping capability without changing stage placement semantics. The composed POC remains `0.20.0`.

### Documentation

- Added the image-formation contract guide and synchronized architecture, physics, motion, API-style, and agent guidance around partial-order/coupled-stage semantics and reserved sensor stages.
- Documented the physical camera-rotation sign/axis conventions, field-dependent mapping, and compatibility boundary with the legacy stabilization-equivalent approximation.
- Documented the declared-scale focus-breathing model, its zero-breathing compatibility case, and the prohibition on inferring real-lens behavior from focal/focus metadata.
- Documented radial distortion normalization, forward/inverse mapping, operating-envelope monotonicity, and the boundary excluding tangential/decentered and named-lens behavior.
- Documented lateral CA as channel-dependent field mapping rather than RGB blur, including the non-spectral/non-CFA calibration boundary.

## 0.3.0 - 2026-09-25

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
- `calculateOutputFieldOfView()` plus explicit physical final-output bounds and output resampling scale.
- `parseRadiometryReadinessProfile()` and `assessRadiometryReadiness()` for explicit scene/optics/photosite/exposure/sensor-response prerequisite gating before any future photon simulation.

### Changed

- Engine API contract advances to `0.25.0`.
- Composed POC simulation API advances to `0.20.0`, preserving legacy requests while completing staged capture orientation/active/output geometry, final-output FOV, capture-mode viewing CoC, orientation-aware subject framing, and explicit output sampling scale.
- The composed POC exposes shared sensor-geometry metrics while retaining backwards-compatible representative pitch fields.
- Capture-geometry mode continues to reject stacking legacy `crop.factor` with staged capture, while subject framing and equivalent-viewing CoC now use explicit staged output/viewing semantics.
- The composed POC continues to expose X/Y sample pitch diagnostics and rejects sensor geometry whose X/Y geometric pitch differs by more than 1% until all pixel-domain calculations are axis-aware.
- Unreleased sensor-architecture schema advances to `0.2.0`: source origin and reuse rights are independent, scalar facts accept multiple evidence records, and each readout capability carries its own evidence.
- `InvalidConfigurationError` now lives in the core dependency layer and remains re-exported from the existing public surface.
- Radiometry readiness distinguishes `not-ready`, `approximate-only`, and `calibrated-ready`; assessment never enables composed photon output by itself.

### Documentation

- Synchronized human and agent guidance with the post-0.2 sensor/capture foundations, evidence/reuse-rights model, radiometry readiness gate, independent API-version surfaces, composed-POC integration boundary, and coordinate/sampling invariants.

## 0.2.0 - 2026-09-21

### Added

- `calculateRelativeRenderedExposure()`, a deterministic relative rendering relation that combines aperture/shutter optical exposure with nominal ISO gain relative to declared reference settings.
- Public input and result types for the relative rendered exposure calculation.

### Documentation

- Added usage guidance and scientific limitations for relative rendered exposure.
- Synchronized package, lockfile, README, and citation version metadata for the release.

## 0.1.0 - 2026-09-20

- Initial public release of the Photivra engine package.
