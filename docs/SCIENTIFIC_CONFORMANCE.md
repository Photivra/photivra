# Scientific conformance: final V1 disposition (#131)

Release context: **package 1.0.1 candidate / root API 1.0.1**. Subsystem/model versions and dated introduction or measurement records below are independent historical identities; they are not distribution versions. See [developer navigation](DEVELOPERS.md) and [release contract](RELEASE_1_0_1.md).

The cross-stage conformance layer complements, rather than replaces, narrow unit tests. `test/cross-stage-conformance.test.ts` consumes #130's canonical owned fixture and merged public APIs only. It checks a coherent ideal-focus/projection→FOV/object-size→pixel-motion/defocus path, then controlled one-stop shutter and aperture variants across exposure, motion and diffraction.

Expectations follow independent Gaussian thin-lens reciprocal distance, angular span reconstruction, millimetre/micrometre pixel conversion, shutter-proportional lateral displacement, t/N² relative optical exposure, and wavelength/f-number Airy scaling. Neutral stationary/in-focus states and non-neutral variants preserve calculated provenance. Relative exposure is not photon-count evidence; no source/sensor calibration is inferred.

`test/signal-conformance.test.ts` adds independent energy/photon/QE/noise identities, including physical shutter exposure versus nominal ISO/rendered exposure. These analytic inputs are not a calibrated scene-to-sensor integration.

## Capture and processed-output slice

`test/raw-output-conformance.test.ts` exercises the merged capture-owned global sensor producer through charge/capacity/noise/ADC, immutable native CFA attachment, explicit reconstruction, declared color interpretation, WB, correction, SDR encoding and paired export. This slice uses the global-exposure fixture; local shutter-window coverage remains in the producer tests.

The fixture reuses #130's 36×24 mm imaging area, 50 mm f/4 lens, 5 m focus, 0.008 s shutter, ISO 100 and stochastic seed. It explicitly replaces the 600×400 native raster with a **6×4 Bayer regression lattice**: square 6 mm pitch, 24 sites. These dimensions are deliberately artificial, suitable for fast ordering/geometry checks, not pixel fidelity, demosaic quality, camera calibration, editor interoperability or performance. The canonical JSON is unchanged. Existing owned phase kernels average each 2×2 tile; six synthetic tile levels and channel differences make an incorrect orientation or source shift observable. Photoelectron expectations are supplied directly, with zero dark expectation and the existing synthetic readout profile (2 electron RMS read noise, 1 electron/code, black 64, white 1023, 1000 electron capacity). No scene radiance, wavelength response or spectral integration is inferred from these numbers.

Independent expectations are calculated from the emitted integer RAW codes, without using engine reconstruction, orientation, correction or SDR functions as an oracle:

| Boundary | Conformance evidence |
| --- | --- |
| Native capture → DNG | Every stored 16-bit strip code equals the produced post-ADC code, without container stretching. Native codes and noise remain identical through four output orientations. |
| RAW → reconstruction → color/encoding | Tile red/blue values and mean of the two green sites are independently black-subtracted and normalized by 959. The declared ideal RGB→XYZ→RGB round trip must preserve them within numeric tolerance. Integer orientation permutations and the piecewise sRGB transfer/8-bit rounding predict every processed pixel. |
| Shutter / ISO / rendering exposure | Twice the shutter doubles expected charge at fixed rates. ISO-only metadata does not change the explicitly selected readout regime, realized charge, RAW codes or processed pixels. Rendering +1 EV doubles linear rendering values while keeping RAW codes and RawDataUniqueID unchanged. No monotonic claim is made about individual Poisson draws. |
| WB → exposure → tone → encoding | Non-neutral gains (2, 1, 0.5), +1 rendering EV and positive Reinhard tone are evaluated independently in sequence. This catches double WB, WB after tone and transfer/quantization ordering errors. |
| Native correction → joint support → orientation | Identity correction preserves the plain processed pixels and view. A one-native-pixel shift reuses the exact noisy capture, excludes the unsupported native edge and yields independently predicted source pixels through all four orientations. RAW codes/default crop/data identity stay unchanged; RAW correction intent is metadata-only. |
| Signed dark values / display clipping | Zero photo/dark expectations preserve below-black read noise in stored RAW and signed reconstruction. Low clipping happens downstream. A separate +8 EV rendering clips all output channels without claiming physical or ADC capture saturation. |
| Unsigned ADC lower boundary | Explicit large read-noise variants with black 0/64 exercise lower-code clamping and separate upper pre-ADC/digital saturation at zero stored charge. Negative electronic noise is not mistaken for negative stored charge. |

Complete file bytes are checked for repeated-export determinism on the neutral rendering path. The strip reader here is a bounded structural regression check, not an independent external RAW editor or TIFF implementation. JPEG **pre-encoding pixels** are the analytic rendering oracle; a lossy JPEG decode is not used to prove exact pixel identity. Existing #16 decoder/editor acceptance remains separately authoritative.

The producer's `upstreamRadiometryVerified: false`, reconstruction's `producerOriginVerified: false` and approximation provenance remain visible. The fixture's unrelated inline float plane contains 999 values; it cannot supply the JPEG reconstruction. ISO independence applies to this explicit regime configuration, not to all future ISO-dependent body profiles.

The shadow check exposed a readout ordering defect: clamping negative electronic noise to zero electrons before adding the pedestal erased valid below-black RAW values. The correction preserves signed electronic signal through the upper-only pre-ADC threshold, adds the black offset, quantizes and then clamps to unsigned code zero/common digital saturation. Physical stored charge remains nonnegative. Readout provenance advances to model **2.0.0** and the producer's required capture noise identity advances to **0.2.0**, rejecting old 0.1.0 producer replay instead of silently recomputing changed shadows. See `SENSOR_RAW_PRODUCER.md` for migration. Public input/output field shapes remain unchanged; root API advances to 0.106.0. Existing positive electronic-signal code math and RNG seed schedule are unchanged.

## Final integrated acceptance

The final contribution is based on merged main `712c031689f5413003a1d15c2d0dfa9466bbbfb8` (#205): #16/#112 export/processing, #178 authoritative integration, #116/#119 tier acceptance and #43/#45 performance dispositions are merged. `test/final-scientific-conformance.test.ts` adds 16 normal-CI tests over those final public paths. PR #206 merged after owner review and contribution-specific DCO certification as `34c6d9aca1c2e365b253c1562734d11bc8e0235f`; post-merge CI 37032338620 passed Node 22.13/24. #131 is closed and the feature/science checklist is 32/32. #180 prepares the 1.0 distribution; tagging/publication remains owner-only.

The suite extracts the existing bounded tier-production request into `test/helpers/tier-production-fixture.ts` and reuses it from both tier acceptance and final conformance. The existing nine-pair/27-pupil suite retains its expectations. No runtime/API/schema/asset/dependency change or reference-golden regeneration occurs.

### Shared laboratory and explicit variants

#130 remains unchanged and supplies the imaging area, optical/exposure/focus reference, wavelength, reflectance, light level and seed. The final path explicitly declares these minimal specialized variants:

- The canonical planar monochromatic reference is extended to an owned **uniform angular environment with a flat 540–560 nm spectral-density band**, using its 550 nm centre, with incident spectral irradiance scaled by `1e-9`. This is not a delta-line spectrum or a measured environment. Lambertian reference radiance is independently `rho * E / pi`; provider values are explicitly supplied, not visibility/transport predictions.
- Native geometry is the existing owned **2×2 Bayer regression lattice** with registered tier topology, an independently declared 800×600 µm rectangular sensitive aperture, effective package-incident EQE 0.4, and explicit synthetic response/linearity bindings. Geometric pitch does not infer photon-collection area, QE or real camera pixels. The 20 nm midpoint bin samples 550 nm. Its finite declared operating ranges remain enforced.
- Exact generic 1.0.0 body/lens selections provide capability policies, finite-focus optical transmission and explicit readout regimes. Relative metering uses the same provider/illumination/material identities and registered time zero, with a supplied normalized scalar reduction. It remains uncalibrated; no physical radiance-to-luminance or manufacturer-specific meter is inferred.
- Neutral constant light replaces the registered waveform with a constant. The controlled temporal variant uses the owned `1 + 200 t` ramp. Orientation and exposure/rendering variants preserve the same scientific stage ownership and seed.

### Independent integrated expectations

For the fixed focus distance `s` and physical focal length `f`, independently solve `v = 1 / (1/f - 1/s)` in millimetres. The declared ideal symmetric working f-number is `Nw = N(1 + v/s)` with explicit unity pupil magnification. With tier transmission `T`, the expected sensor spectral irradiance is `L * pi * T / (4 * Nw²)`.

Expected generated electrons are independently:

`E_sensor * (800 * 600 * 1e-12 m²) * (20 nm) * (550e-9 m) / (h*c) * 0.4 * integratedSeconds`.

Here `h = 6.62607015e-34 J s`, `c = 299792458 m/s`. Constant light uses `integratedSeconds = duration`; the registered ramp integrates to `duration + 100 * duration²`. Uniform radiance makes normalized spatial weights integrate to unity. The chosen single spectral bin matches the declared midpoint rule; this is not a convergence/physical error bound.

Uniform relative scene-light factors 0.5/1/2 drive aperture-priority shutter to `t/factor` at fixed aperture/ISO, preserving expected photo charge. The independently declared dark rate still adds `4 * resolvedDuration` electrons, so total charge is not incorrectly held fixed by the meter. Compensation −1/0/+1 EV changes physical duration by 0.5/1/2 before charge/noise, without mutating the meter snapshot. The ramp and its equal-mean constant-field variant agree before stochastic sampling; no monotonic statement is made about individual random draws.

Post-capture +1 rendering EV doubles linear rendering values while preserving the complete physical result, capture serialization, native codes, noise seed and RAW data identity. The same realized RAW feeds production processing and paired export, with stored DNG codes independently read from the strip. Whole plan and file bytes replay deterministically. This structural strip check is not an external reader or independent TIFF implementation; #16's merged reader/editor acceptance remains its own evidence.

### Acceptance and API-style disposition

| #131 requirement / boundary | Final evidence and disposition |
| --- | --- |
| #130 across multiple domains | Existing `basic-reference-scene`, `cross-stage-conformance`, `signal-conformance`, `raw-output-conformance` suites plus the new shared-scene meter/optics/sensor/production/export path. Canonical fixture unchanged. |
| Coherent end-to-end deterministic path | All three exact tiers: scene-derived relative meter → immutable target/compensation → capability-based aperture-priority resolution → committed capture → invoked scene queries → finite-focus optics → spatial/spectral/temporal EQE → dark/charge/capacity/seeded noise/ADC → native RAW → production processing → paired DNG/JPEG. Independent SI count arithmetic and exact file codes. |
| Neutral and non-neutral variants | Constant neutral field; 0.5/1/2 scene light; −1/0/+1 compensation; registered temporal ramp/equal-mean field; four orientations; post-capture +1 EV. Existing suites cover focus, diffraction, motion, signed shadows, WB/tone, correction and spatially distinct orientation/crop patterns. |
| Ordering/coupling failures | New stale scene/seed/exposure/tier commitments block processing before source invocation. A trusted callback exception propagates instead of producing fallback output. Existing production tests cover missing renderer/stage support, temporal count/motion/focus/geometry mismatch and double attached/executed RAW paths. |
| Tier coherence and tradeoffs | Merged nine-pair production/output and 27 independently evaluated pupil cases in `generic-tier-production-acceptance`; versioned reports/envelopes, immutable correction A/B, stabilization/flash/flare in `generic-tier-report-acceptance`; no universal ranking or duplicate large fixture. |
| Final performance disposition | Merged #205 [performance report](V1_PERFORMANCE_DISPOSITION.md), complete 64-case independent POC equivalence, scalar/batch mutation and numerical guards. No new timing threshold or tiny-raster throughput claim. Runtime sources unchanged, so no fresh performance implementation is implied here. |
| API-style drift | Existing `api-style-compatibility` scans the entire root callable surface against documented verbs, compatibility sentinels and independent version surfaces. New path exercises input objects, calculation envelopes, versioned immutable records, exact identities and deterministic serialization. All checks must pass; no accidental convention change is introduced. |
| CI cost and independence | 16 new bounded tests; no network, private app, Blender, proprietary data, new dependency or expensive photoreal renderer. Existing focused suites remain authoritative. |

Scientifically meaningful API differences remain intentional under [API_STYLE.md](API_STYLE.md): parsers/targets/resolvers/plans/manifests return their semantic records, primitive calculations return `CalculationResult`, file export is asynchronous for encoding/hash work, and trusted caller-code exceptions may propagate while scientifically incomplete well-formed plans carry structured blockers. A physical approximation stays approximate even when its metadata/identity is valid. FNV plan fingerprints and SHA-256 capture/file/corpus commitments retain their separate contracts. No coercive wrapper or cosmetic public rename is warranted.

### Limits and completion boundary

The first physical route retains unity field throughput, optional destination-local PSF approximation and bounded sensor/provider-evaluation limits. The new neutral tier route explicitly omits PSF; existing executed environment/production tests cover declared sampled PSF and motion/rolling shutter, and tier pupil scenes independently validate finite profiles. No full field-dependent PSF transport, calibrated source visibility/radiometry/sensor color, generic arbitrary-optics integration, full-resolution throughput or private product fidelity is claimed. Upstream provider transport and radiometry verification remain false in the new complete path.

This final conformance disposition consumes the finite approved V1 support and documented limitations. It neither invents a new V1 deferral nor certifies scientific accuracy merely from passing tests. #180 still owns the exhaustive human/agent/source documentation audit, 1.0 packaging/release preparation and final limitations review. No tag, package publication or release is authorized by this contribution. Human review and contribution-specific DCO remain required before #131 closes.
