# Ideal pupil rays for bounded capture

`calculateSensorApertureRays()` generates rays that start at different points across the lens pupil, for an explicitly declared ideal symmetric thin lens. Sampling the pupil like this lets a scene provider see the slightly different viewpoints that cause real depth-of-field blur and partial occlusion.

**Coordinates.**

- Native sensor coordinates use +Y down.
- Camera look directions use +Y up and +Z forward.
- Ray origins lie in the lens's principal plane, in metres.
- Pupil sample points are in millimetres.

**Geometry.**

- For focal length f and nominal f-number N, the circular pupil radius is f/(2N).
- The shared focus contract gives the image distance v.
- For a finite object-plane distance D, every unrotated ray passes through (xD/v, -yD/v, D). At infinity, the rays stay parallel.
- The existing constant-axis camera rotation rotates both origin and direction about the principal-plane origin, at the actual local shutter time. It uses the same physical right-hand pitch/yaw/roll convention as the inverse image mapping.

**Sampling.** Points are spread evenly by area, at polar midpoints:

- r = R sqrt((i + 1/2)/Nr)
- theta = 2 pi (j + 1/2)/Na

Each ray has a normalised weight of 1/(Nr Na). Counts are limited to 1..32 radial and 4..64 angular samples, with at most 256 rays. These are integration samples, not a guarantee of convergence.

## Capture integration

**How to use it.** Pass `pupil`, and the separate `evaluateApertureRadiance(request, ray)` callback, to `calculateEnvironmentSensorPhotoSignal()` or `simulateEnvironmentSensorRawFrame()`.

- The callback receives the actual pupil origin and look direction.
- The callback owns scene intersection, visibility, and the emitted or transported radiance at each wavelength.
- The engine owns focus, rotation, local shutter timing, sensor response and RAW production.
- When pupil sampling is omitted, the old single-argument environment callback still works, unchanged.

**What the engine does with the rays.**

- It averages physical irradiances over the normalised pupil weights, before sensor integration.
- The existing working-f-number radiometric factor is applied once. Pupil area is not multiplied in again.
- A sampled local PSF and pupil integration cannot be used together. That would add a second, implicit defocus, or an optical combination that has not been reviewed.
- Every ray, and the total provider budget, are checked before any provider call.
- Full-frame site completeness, seeds, and the 4,096-site and 100,000-query limits are unchanged.

**Diagnostics.**

- They keep the original central `query`, plus `apertureRequest` and `apertureRay` for the ray actually evaluated.
- `pupilIntegrationApplied` and `pupilIntegrationProfile` report the declared integration.
- Provider transport and scene visibility stay unverified.

The production composer rejects this standalone route until depth and visibility fidelity have an explicit composition contract. This API does not turn on a production stage.

## Limits and evidence

This is an ideal paraxial (small-angle) approximation, with unity pupil magnification. It does not model diffraction, aberrations, pupil clipping, the lens housing, calibrated lens transmission, camera translation, scattering or physically measured sensor response. Separately declared field and spectral transmission stay separate. No megapixel RAW capability or physical device acceptance is established.

**Tests** independently check:

- that finite rays meet at the focus plane;
- pupil moments;
- footprints through focus;
- that rays at infinity are parallel;
- coordinate signs;
- camera rotation.

Capture tests check:

- that uniform radiance matches the unchanged no-pupil path;
- visibility averages that depend on the ray origin;
- exact replay with a fixed seed;
- callback ownership;
- rejection before any provider work.

These synthetic controls do not validate arbitrary scene providers.

**References** (conceptual): [PBRT projective camera models](https://www.pbr-book.org/4ed/Cameras_and_Film/Projective_Camera_Models) describes ideal lens sampling; [PBRT realistic cameras](https://www.pbr-book.org/3ed-2018/Camera_Models/Realistic_Cameras) contrasts it with full lens geometry. The implementation and tests are original Photivra work using existing engine helpers. No code, data or prose from the references is included. AI-assisted work stays a draft until substantive human review of science and sources.
