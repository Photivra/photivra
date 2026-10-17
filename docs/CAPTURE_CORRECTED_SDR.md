# Capture-bound corrections and SDR

> **Release context.** This page was written for package 1.2.0 (root API 1.2.0) and has not been re-reviewed for later releases. The [changelog](../CHANGELOG.md) describes the current release. Model and subsystem version numbers on this page, and any dated records, are separate from the package version. See also the [developer guide](DEVELOPERS.md) and the [1.2.0 release contract](RELEASE_1_2_0.md).

`calculateCaptureCorrectedSdr()` applies digital lens corrections to a simulated capture, then renders it to SDR (standard dynamic range).

It takes the same immutable `SimulatedCapture`, and the same explicit source, colour and white-balance (WB) choice, as `calculateCaptureSdr()`. It then runs the existing lens corrections ([stray light and digital lens correction](DIGITAL_OPTICS_FOUNDATION.md)) before the existing SDR renderer.

This is a bounded reference bridge. It does not replace the production composer, does not turn on production stages, and does not complete the processed-output work or V1.

## Order of operations

1. validated inline source;
2. existing colour and WB;
3. geometry and chromatic aberration (CA) correction, in the native-optical, reconstructed-linear domain;
4. illumination gain;
5. exact orientation permutation;
6. explicit support crop;
7. SDR.

**Profiles.** Correction profiles must be written for **linear sRGB/D65, after colour and WB**. They are not interchangeable with CA calibration for sensor channels. Components in the raw domain, and geometry placed after a gain, fail through the existing executor. No WB estimator, optical equation, noise generator or tier-based strength is added.

## The `correction` input

The strict `correction` contract requires:

- an exact generic profile, and an independently declared optical state;
- `coordinateFrame: "native-optical-linear-srgb-d65"`;
- the selections and selection kind;
- a resampler;
- a positive finite clipping level;
- a local `frameTimeSeconds`;
- a support policy;
- a unique public output state ID.

Unknown or private fields fail. The engine checks that the profile matches the state, and checks the committed focal length, aperture, finite focus and native output dimensions. Infinity focus is still unsupported by the profile schema.

Body and lens identity and version, acquisition mode, frame rate, stabilisation and profile accuracy are **declarations by the producer**. The capture container does not establish them independently, and they are never upgraded to calibration.

## Geometry

- Metric rasters are derived from the committed physical bounds, through the capture coordinate bridge. A pitch or centre from the caller is not accepted.
- The corner UVs of all four orientations map to native optical +X right / +Y up.
- Quarter-turn sample permutations reuse the existing raster point transform, with no extra interpolation.
- Profile output dimensions are **native optical output dimensions**. For a portrait capture they are swapped relative to the final oriented width and height.
- Square physical pixel pitch is required for both source and destination (relative tolerance 1e-12). Non-square lattices fail rather than being stretched.
- Off-centre capture and output keep their optical-axis offsets.

**Time and focus.**

- The local frame time must fall within the exposure interval. The capture's scene-clock time is kept separately.
- Focus-aware projection reuses the field-of-view calculator, and its child result is returned.
- The conventional focal equivalence of the active capture, and the physical geometry, are never rewritten by correction or output crop.

## Limits and support

- Source and destination are limited to 65,536 sites each.
- After colour and WB, the image must be inline, co-sited, three-channel RGB.
- There is no external loading, streaming or prefilter generation. `source-prefiltered` remains an obligation on the caller; the engine does not verify that it is adequate.
- Child sampling plans keep native optical coordinates, full Jacobians, per-channel support, resampler identity and prefilter diagnostics.
- Top-level support uses the full **oriented output** lattice.

**Support policies.**

- `reject` requires every requested output pixel to be valid.
- `joint-valid-crop` uses the existing largest all-valid rectangle after orientation. Empty support fails.
- No missing channel is padded, mirrored or replaced with black.

**Output view.** `outputView.rect` lies within the declared oriented output raster. The cropped samples and dimensions are a derived view. They are not a replacement capture plane, and not a new physical capture. A later file adapter must map this view and crop metadata deliberately; the paired DNG/JPEG exporter is unchanged.

## Provenance and diagnostics

- Original source, capture and noise IDs, the source dynamic-range history and upstream saturation stay separate from the optional colour, correction and SDR child provenance.
- Overall provenance is approximation, because the corrections are generic-parametric.
- `illuminationClippingEventCount` counts clipping events per channel and stage **before the joint support crop**, including repeated gain stages. It is not a count of output pixels or of capture saturation.
- SDR gamut diagnostics describe the retained view.
- Signed values and headroom survive until explicit gain clipping or SDR handling.
- Noise covariance and SNR are not regenerated or inferred.

**Re-running.** Any existing digital correction history rejects a second run; staged re-correction would need a future explicit contract. The view must not be relabelled as untreated RAW. Mandatory or automatic camera states, and the educational reference bypass, stay distinct. Bypass still applies the committed output crop and resampling.

## Compatibility and evidence

- Root API 0.100.0 → 0.101.0; adapter schema 0.1.0; package, POC, capture and production unchanged.
- The existing capture-SDR adapter shares an internal source validator, and keeps its behaviour.
- Independently written tests cover quarter turns and shifts in native direction, non-mutation and determinism, crop and support, history and clocks, separation of clipping, and unsupported boundaries.
- No runtime dependency, third-party implementation, data or calibration, or new cost is added.
- Human review of science and provenance, and DCO certification for the contribution, are required before inclusion.

Remaining V1 work at the time: an authoritative sensor RAW producer, explicit production composition, wiring the corrected view to files, end-to-end production acceptance (capture → RAW → processed file), and external checks in Adobe and open-source RAW editors. This bridge does not mark any of these complete.
