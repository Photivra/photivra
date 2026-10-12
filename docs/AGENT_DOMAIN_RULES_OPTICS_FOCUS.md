# Photivra engine agent rules: Optics and focus

These rules moved verbatim from [the domain rules index](AGENT_DOMAIN_RULES.md) and **remain binding** for PSF/pupil, diffraction, vignetting, lateral CA, radial distortion, focus breathing, stray light and digital optical corrections changes and their tests, reviews, documentation and APIs. The index's scientific-integrity rules apply to every domain; for cross-domain work, also read every other affected domain file. This file is not a substitute for the canonical API, scientific, provenance or numerical specifications.

## PSF/pupil foundation rules

`getPsfFoundationContract()` and `calculatePsfFoundationComponents()` define the current PSF contribution boundary.

- Keep geometric defocus and circular diffraction separately named; do not add their diameters or convert them into one undocumented blur/sharpness scalar.
- Do not call the current diagnostics a complete PSF or MTF.
- Field position, focus/subject depth, wavelength basis, and pupil semantics are explicit context.
- The current field position is context only for defocus/Airy; do not invent field dependence until a corresponding model is implemented.
- Ideal regular-polygon non-circular diffraction is implemented only through its explicit equal-area, on-axis, zero-phase scalar API. Arbitrary non-circular real diaphragms are not inferred. Mechanical pupil clipping, field curvature, field-dependent aberration and bokeh require explicit #113 profile/evaluator semantics; never infer them from blade count or legacy diagnostics.
- Illumination vignetting remains throughput-only and outside the PSF contribution list.
- Polygon aperture geometry does not by itself implement non-circular diffraction.
- Preview/reference renderers may differ in bounded fidelity but must preserve engine-owned contribution semantics.
- Test Fixture optics/highlight targets are regression evidence, not calibrated MTF or real-lens PSF data.
- Real-lens PSF profiles require defensible provenance, compatible reuse rights, and explicit limitations/uncertainty.

## Illumination-vignetting boundary

`calculateIlluminationVignetting()` is the engine-owned generic field-throughput model.

- Apply `linearThroughputFactor` only in scene-linear/channel-linear space, before display/gamma encoding.
- Optical-axis throughput is normalized to 1; generic illumination vignetting may attenuate but must not amplify above that reference.
- Respect `maximumNormalizedRadius` and the full-envelope validity gate.
- Do not use this model to warp coordinates, change focus, clip the pupil, alter PSF shape, or synthesize cat's-eye bokeh.
- Mechanical/pupil vignetting belongs to the separate pupil/PSF foundation.
- Test Fixture neutral patches provide regression evidence only; they are not calibrated radiometry.
- Do not infer named-lens coefficients or calibrated transmission from public images/specs.
- Do not compose this standalone model into the POC/app without an explicit contract/version review.

## Lateral-CA boundary

`calculateLateralChromaticAberrationMapping()` and its inverse are engine-owned channel field mappings.

- Treat red/green/blue as representative renderer channels, not wavelengths or CFA calibration.
- Green is the reference/common base distortion. Red and blue use coefficient offsets added to that base.
- Do not apply the same base distortion again as a separate renderer pass.
- All combined channel profiles share one physical normalization radius/operating envelope and must satisfy the radial invertibility contract.
- Renderers should inverse-map each destination channel to the engine-derived source coordinate; do not substitute an RGB blur or arbitrary post-output pixel offset.
- Longitudinal CA, spectral PSFs, sensor color response, and named-lens calibration are outside this model.
- Test Fixture RGB edges can verify renderer behavior but are not spectral calibration evidence.
- Do not compose this standalone model into the POC/app without an explicit contract/version review.

## Radial-distortion boundary

`calculateRadialDistortionMapping()` and `calculateInverseRadialDistortionMapping()` are the engine-owned generic radial field-mapping primitives.

- Coefficients are meaningful only with the declared `normalizationRadiusMm`; never copy coefficients into a different normalization silently.
- Respect `maximumNormalizedRadius` as the profile operating envelope.
- Profiles must remain strictly monotonic over the declared envelope so inverse mapping stays single-valued.
- Renderers should consume the inverse mapping semantics for destination-to-source sampling; do not define backend-specific distortion equations.
- This slice is optical-axis-centered and radial-only. Do not pretend it includes tangential/decentering, anamorphic, CA, or calibrated named-lens behavior.
- Test Fixture visual grids are regression evidence, not calibration data.
- Do not compose distortion into the POC or app camera science without an explicit contract/version review.

## Focus-breathing boundary

`calculateFocusBreathingProjection()` and `calculateFocusBreathingFieldOfView()` are generic declared-scale approximations.

- Never infer `breathingProjectionScale` from focal length, focus distance, sensor crop, lens brand/model, or adjacent metadata.
- Scale `1` must reproduce the existing focus-aware thin-lens projection exactly.
- Physical focal length remains authoritative; do not relabel effective projection distance as focal length.
- Digital/output crop must remain downstream and must not be folded into the breathing scale.
- A real-lens breathing profile requires defensible provenance, compatible reuse rights, and explicit limitations/uncertainty.
- Keep distortion, CA, pupil magnification, vignetting, and PSF effects separate unless a later documented model couples them.
- Do not compose this standalone model into the POC without a POC API/version review.

## Standalone stray light and digital corrections

- Consume `docs/DIGITAL_OPTICS_FOUNDATION.md` for #114/#118/#117. These primitives do not activate production-plan stages or change POC behavior.
- Ghost/veil contributions are additive spectral irradiance before exposure/sensor processing. Keep diffraction, primary PSF, contamination and display effects separate.
- Profiles require exact generic system/acquisition binding and explicit generic evidence. Do not promote synthetic coefficients to calibration or extrapolate.
- Preserve full destination-to-source Jacobians, compatible-domain groups, resampler identity, prefilter requirements and valid-source masks/joint crops. Invalid support remains unavailable.
- Corrections warp already-sampled blur/noise; gain changes downstream signal/variance without rewriting photons. RAW metadata intent, camera mandatory settings and educational reference bypass are separate states.
- The bounded RGB executor accepts reconstructed-linear geometry/CA followed by gain only. Reject incompatible-domain or geometry-across-gain execution rather than reorder it. Production #111/#112 require their own explicit composition.
- Reconcile root API versions against other pending API branches before merge; the root API and package versions stay aligned while schemas and POC versions remain independent.
