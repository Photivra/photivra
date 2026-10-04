# Ideal pupil rays for bounded capture

`calculateSensorApertureRays()` generates origin-aware rays for an explicitly declared ideal symmetric thin lens. Native sensor coordinates use +Y down; camera look directions use +Y up and +Z forward. Origins lie in the lens principal plane and use metres. Pupil sample points use millimetres.

For focal length f and nominal f-number N, the circular pupil radius is f/(2N). The shared focus contract determines image distance v. For finite object-plane distance D, every unrotated ray intersects (xD/v, -yD/v, D). At infinity the rays remain parallel. The existing constant-axis camera rotation rotates both origin and direction about the principal-plane origin at the actual local shutter time.

Uniform-area polar midpoints use r = R sqrt((i + 1/2)/Nr) and theta = 2 pi (j + 1/2)/Na. Each ray has normalized weight 1/(Nr Na). Counts are bounded to 1..32 radial and 4..64 angular samples, with at most 256 rays. These are integration samples, not a convergence guarantee.

## Capture integration

A caller may supply `pupil` and the separate `evaluateApertureRadiance(request, ray)` callback to `calculateEnvironmentSensorPhotoSignal()` or `simulateEnvironmentSensorRawFrame()`. The callback receives the actual pupil origin and look direction. It owns scene intersection, visibility and emitted/transported wavelength-resolved radiance; the engine owns focus, rotation, local shutter timing, sensor response and RAW production. The old single-argument environment callback remains compatible and unchanged when pupil sampling is omitted.

The engine averages physical irradiances over normalized pupil weights before sensor integration. The existing working-f-number radiometric factor is applied once. Pupil area is not multiplied again. A sampled local PSF and pupil integration are rejected together: neither an implicit second defocus nor an unreviewed optical composition is permitted. Every ray and the total provider budget are preflighted before provider execution. Full-frame site completeness, seeds and 4,096-site/100,000-query limits remain unchanged.

Diagnostics retain the original central `query`, plus `apertureRequest` and `apertureRay` for the actual evaluated ray. `pupilIntegrationApplied` and `pupilIntegrationProfile` report the declared integration. Provider transport and scene visibility remain unverified. The production composer rejects this standalone route until depth/visibility fidelity has an explicit composition contract; this API does not activate a production stage.

## Limits and evidence

This is an ideal paraxial approximation with unity pupil magnification. It does not model diffraction, aberrations, pupil clipping, lens housing, calibrated lens transmission, camera translation, scattering or physically measured sensor response. Existing separately declared field and spectral transmission remain separate. No megapixel RAW capability or physical device acceptance is established.

Tests independently intersect finite rays with the focus plane, check pupil moments, through-focus footprints, infinity parallelism, coordinate signs and camera rotation. Capture tests check uniform radiance against the unchanged no-pupil path, origin-dependent visibility averages, exact seeded replay, callback ownership and rejection before provider work. These synthetic controls do not qualify arbitrary scene providers.

Conceptual references: [PBRT projective camera models](https://www.pbr-book.org/4ed/Cameras_and_Film/Projective_Camera_Models) describes ideal lens sampling; [PBRT realistic cameras](https://www.pbr-book.org/3ed-2018/Camera_Models/Realistic_Cameras) distinguishes full lens geometry. Implementation and tests are original Photivra work using existing engine helpers; no reference code, data or prose is incorporated. AI-assisted work remains draft pending substantive human scientific/source review.
