# Generic equipment tier reference assets

Release context: **package 1.0.0 candidate / root API 0.116.0**. Subsystem/model versions and dated introduction or measurement records below are independent historical identities; they are not distribution versions. See [developer navigation](DEVELOPERS.md) and [release contract](RELEASE_1_0.md).

`resolveGenericEquipmentTierCatalog({ presetVersion: "1.0.0" })` returns immutable
Consumer, Prosumer and Professional body/lens reference bundles. These are
Photivra-owned synthetic educational approximations, with unquantified physical
uncertainty. They are not measured calibration, commercial camera emulation or a
universal ranking of real equipment.

The tier is a catalog key. Scientific functions consume the ordinary explicit
profiles; no tier multiplier enters their equations. Sensor format, native raster
and capture geometry remain caller-owned. All three initial lens forms are 50 mm
primes with a common f/4–f/16 capability range; prime/zoom and focal range are
separate asset properties rather than tier meanings. This first catalog contains
no zoom, macro, OIS or variable focal-length family.

## Exact selection and reference binding

```ts
import {
  createGenericEquipmentTierSelection,
  parseGenericEquipmentTierSelection,
  resolveGenericEquipmentTierLensProfiles
} from "@photivra/engine";

const selection = createGenericEquipmentTierSelection({
  presetVersion: "1.0.0",
  bodyTier: "consumer",
  lensTier: "professional"
});
const saved = parseGenericEquipmentTierSelection(
  JSON.parse(JSON.stringify(selection))
);
const profiles = resolveGenericEquipmentTierLensProfiles({
  selection: saved,
  state: {
    bodyId: "photivra-consumer-body", bodyVersion: "1.0.0",
    lensId: "photivra-professional-prime", lensVersion: "1.0.0",
    focalLengthMm: 50, aperture: 4, focusDistanceM: 5,
    captureMode: "still", frameRateHz: 0, stabilizationMode: "off",
    outputWidth: 600, outputHeight: 400
  }
});
```

Omitting `lensTier` pairs matching tiers; all nine pairings are allowed through
#109's capability resolver. The strict saved-selection parser binds exact IDs,
preset version and every profile reference, including versions on wrappers for
subsystems whose native profile lacks a version field. Unknown fields, missing
references, changed versions and a `latest` alias fail. It returns the canonical
immutable selection. Output dimensions must be explicit and valid; they do not
select sensor size. This module does not mutate the POC or production plan.

The optical resolver supports only the explicit still/reference acquisition
state above. Aperture capability does not authorize extrapolating optical data
outside f/4. Still stabilization must be off for this optical slice. It exposes:

- radial distortion and lateral-CA channel maps (the CA map already includes the
  common radial base; do not apply that base twice);
- normalized illumination vignetting, separate breathing projection scale and
  a synthetic flat 540–560 nm transmission reference;
- nine scalar Fraunhofer complex-pupil slices at center, mid-field (10, 6 mm),
  corner (18, 12 mm), each at signed image-plane defocus −20, 0 and +20 µm;
- a 550 nm/vacuum clean-lens ghost/veil profile, and separately declared
  reconstructed-linear geometry/CA/gain correction components.

The 5×5 pupil grids and OPD arrays are independently authored discrete reference
responses tagged to these exact contexts. They are not an inferred continuous
lens model or a physically calibrated prediction at arbitrary defocus. No
interpolation is offered. Normalized PSF shape energy remains one; relative pupil
throughput stays separate. Pupil clipping and illumination falloff are separate
contributions with distinct ownership. Their simultaneous production composition
is not defined here. LoCA, spectral bokeh, onion rings, texture rendering and
measured MTF are not implemented by these assets.

Correction transforms retain the established destination-to-source semantics.
Sequential common radial and channel-offset transforms are generic approximate
compensation; they do not claim the exact inverse of the combined optical CA
map. Gain is partial and amplifies sampled noise. Correction never recreates
photons, updates metering, regenerates noise or changes physical capture history.
The caller must provide any required source prefiltering; a resampler declaration
is a contract, not proof that prefiltering was performed.

## Curated declarations and tradeoffs

| Explicit body declaration | Consumer | Prosumer | Professional |
| --- | --- | --- | --- |
| Maximum standard exposure index | 6400 | 12800 | 25600 |
| Maximum declared cadence (fps) | 4 | 8 | 12 |
| Maximum logical sequence frames | 8 | 16 | 24 |
| Base electronic RMS read noise (electrons) | 6 | 3 | 2 |
| Data readout duration (seconds) | 0.030 | 0.015 | 0.008 |
| Pitch/yaw/roll stabilization gain | 0.35 | 0.65 | 0.85 |
| Continuous AF mode | unavailable | available | available |
| Highlight-weighted meter/ambience AWB | unavailable | available | available |

ISO selects explicit readout regimes on a finite power-of-two setting grid.
It is not a photon/noise equation. Full-well/storage physics is not inferred from
pre-ADC saturation or ADC white. AF uses the same ideal instantaneous actuator
for every tier; mode availability does not establish faster or more accurate
tracking. Data readout duration does not establish exposure scan or flash motion
geometry. Flash capabilities declare front/rear ordinary sync and no HSS; callers
must resolve actual exposure-window compatibility separately.

The lens declarations intentionally include a tradeoff: Professional has less
clipping/stray light and lower radial/CA coefficients, but more f/4 falloff and
peripheral gain cost than Prosumer. Near/far pupil character also differs rather
than every wavefront coefficient shrinking monotonically. No overall quality or
bokeh score is produced.

## Acceptance boundary

`test/generic-tier-presets.test.ts` reuses #130's canonical focal length, aperture,
focus, illumination wavelength and exposure time. It leaves that fixture unchanged.
A small explicit 9×9 sampled-ramp/noise target tests correction using one capture
and one noise identity for Off/On. The target is a sampled executor fixture, not a
radiometrically composed scene or a resolution/MTF claim. Multidimensional pupil
checks cover all declared field/defocus slices and separate passivity/energy.
Every advertised ISO setting resolves into an explicit regime. Matched angular
disturbance, corner radial/CA, off-frame ghost/veil and correction Jacobian/source
coverage checks consume the existing low-level APIs. The shifted output lattice
exposes missing support and joint crop rather than extending edges.

`test/fixtures/generic-tier-assets-v1.json` pins the complete canonical manifest
with SHA-256. Retuning an existing version requires deliberate fixture change and
review; accepted retuning must introduce a new preset/profile version while
retaining historical definitions required by saved simulations. This initial
resolver recognizes only 1.0.0 and rejects unavailable history without fallback.

Initial acceptance was partial; the current #116 disposition is documented in
[TIER_PRESET_ACCEPTANCE.md](TIER_PRESET_ACCEPTANCE.md). #119 remains the broader
cross-tier validation ticket. The following inventory describes the initial slice.
Remaining acceptance includes composed physical scene/corrected-image reports,
residual CA/distortion and retained-FOV/stretch/edge-response envelopes, controlled
bokeh/textured backgrounds and spectral effects where modeled, broader body
stabilization/AF/drive/meter/WB execution cases, and applicable output paths.
There is no separate tier-specific browser approximation to compare here; the
public implementation remains browser-safe and uses the ordinary reference APIs.
No private application acceptance is invented.

Initial tier assets landed at root API 0.105.0; the current root API is 0.116.0.
This acceptance-only extension does not change runtime/API or asset definitions. Selection schema 0.1.0, asset version 1.0.0, npm package,
POC and production contracts remain independent. Human scientific/provenance
review and contribution-specific DCO certification are still required.

## Correction residual and sampled-edge acceptance

`test/generic-tier-correction-acceptance.test.ts` extends #119 with the exact 1.0.0
assets on a 9×9 synthetic slanted-step target and fixed alternating noise. Correction
Off/On forks one sampled capture. Independent k1 radial arithmetic, finite-difference
Jacobians, bilinear weights and polynomial partial-reciprocal gain predict every
channel sample. These checks quantify sampled interpolation, not optical MTF or a
radiometrically composed scene.

Independent monotonic scalar bisection recovers ideal coordinates through each
combined physical radial/CA map. Common green distortion is compensated, while
sequential partial channel correction leaves a nonzero, reduced CA residual. The
bounded sampled points require less than 0.1 mm residual displacement; this is a
regression envelope for synthetic definitions, not measured accuracy or a continuous
field guarantee. Full 2×2 Jacobians, determinants and principal stretches are checked
independently. A shifted lattice checks exact missing-source support and the joint
valid crop. Retained channel pixel-center ray envelopes remain distinct from captured
pixel-edge FOV; the joint RGB crop cannot expand a channel's ray coverage.

No runtime, root API, schema, preset manifest, package or POC behavior changes.
This does not complete #116/#119: physical PSF/scene composition, broader body
execution and applicable export acceptance remain separately tracked.

## Body execution acceptance

`test/generic-tier-body-acceptance.test.ts` executes the exact 1.0.0 body
assets through existing public APIs using #130's matched optical/exposure state.
Fifteen cases cover all three tiers:

- Burst times follow the maximum of explicit cadence and exposure duration;
  a slow shutter cannot overlap ordinary still exposures. Self-timer delay is
  applied once. Frame seeds are reproducible/distinct within the tested sequence;
  frame-count limits and unsupported focus bracketing reject.
- Single AF acquires and holds; focus/release priority gates remain separate.
  Consumer rejects continuous AF; Prosumer/Professional follow the same known
  target and require explicit reacquisition after loss. The common ideal actuator
  does not establish real tracking speed or recognition performance.
- Uniform/highlight metering uses independently calculated weighted means and
  target ratios, stays invariant to output crop, and rejects tone-mapped input.
- Observable pre-WB weighted patches yield independent logarithmic-strength AWB
  gains. Clipped samples are excluded/reported, unsupported policies reject,
  and a locked state preserves resolved gains without altering RAW/exposure.
- Global data-readout declarations retain nonzero duration with zero spatial
  phase skew under all three shutter mechanisms. These tests do not establish
  exposure-boundary scans, flash compatibility or rolling-motion behavior.

Assets, runtime contracts and all versions remain unchanged. These are bounded
synthetic body-policy execution checks, not measured camera calibration or full
capture/production/output acceptance. Physical scene/PSF composition, applicable
export wiring and broader stabilization/flash acceptance remain separate work.

## Readout-to-file acceptance

`test/generic-tier-output-acceptance.test.ts` binds the exact body 1.0.0
readout/signal-chain profiles to an explicitly declared owned 2×2 Bayer/native-still
test topology. The topology IDs are registered to those required by the assets;
matching channel names alone is not the binding. Charge expectations, physical
storage capacity and ideal test-color interpretation remain independent synthetic
fixture contracts. This tiny raster is structural regression evidence and is not
an external-editor acceptance file or a realistic pixel sampling model.

Nine cases verify that ISO 100/400 resolve the same base regime and ISO 800 selects
the explicitly declared high regime. Expected photons/charge and the realized
stored charge remain unchanged while electronic noise and conversion gain change.
Independent signed-signal/pedestal/quantization arithmetic predicts each RAW code.
The producer itself still consumes an explicit regime: changing ISO metadata
without changing that regime cannot alter its samples. Unsupported ISO settings
reject in the upstream capability resolver.

Both regimes export through all four orientations. Stored DNG codes match every
native produced sample; downstream +1 EV preserves codes, capture/noise and RAW
image identity while changing processed pixels. Repeated JPEG export is deterministic.
These are genuine producer-to-file checks, with upstream radiometry and producer
origin verification still explicitly unasserted. They do not establish tier lens
PSF/scene composition, calibrated color, full production activation or external
editor/high-resolution interoperability. Runtime, API/schema and asset versions
remain unchanged.


## Supported production and finite pupil scene acceptance

`test/generic-tier-production-acceptance.test.ts` runs every body/lens pairing
through the authoritative plan 0.7.0 environment route using the exact preset
transmission values and body readout/ISO profiles. A separately identified fixture
bridge explicitly binds the selected lens's transmission to its exposure-capability
profile ID; those two IDs represent different contracts. The test does not retune
or overwrite the saved 1.0.0 assets.

The owned 2×2 sensor registration, 540–560 nm flat EQE, charge capacity, dark
current and ideal output color are independent approximations, never facts inferred
from body tier. All three body selections produce the same expected photo charge
for a given lens. The lens transmission ratios independently predict photo-count
ratios; ISO regime changes preserve photo charge. Executed RAW is preserved through
processing and deterministic paired export. Both consumer manifests retain the same
immutable executed result. Unsupported wavelength support and stale commitments
reject before provider callbacks.

Production explicitly omits PSF and declares unity field throughput. It does not
claim to compose the assets' discrete 550 nm pupil data across a continuous spectrum,
combine pupil clipping with illumination falloff, or execute every lens effect.
That omission remains recorded as modeled-zero with evidence and limitations.

A separate finite monochromatic sampled scene evaluates all 27 exact field/defocus
pupil responses. An independent direct phase sum predicts each normalized PSF tap;
controlled texture/highlight samples are summed at every tap with metric pitch and
+Y-up/native +Y-down signs. The same sampled physical response feeds correction
Off/On, retaining capture/noise identity, full Jacobians and retained ray coverage.
This coarse sampled scene is neither measured MTF nor a continuous optical model,
color-fringing prediction or a perceptual bokeh score. No interpolation, sharpen
pass, hidden quality multiplier or external data is introduced.

See the acceptance disposition for #116 ownership, merged #119 validation and
scientific limits. Runtime/API/schema/asset/package/POC versions stay unchanged.


## Versioned cross-tier reports

The reviewed/merged #119 acceptance layer is [TIER_ACCEPTANCE.md](TIER_ACCEPTANCE.md).
It links a reproducible three-domain report, normative finite regression envelopes,
explicit multidimensional pupil/texture and crop/gain tradeoffs, and matched signed
stabilization/ordinary-flash checks. Existing body, correction and producer-to-file
acceptance remains part of that evidence. Measured calibration and unsupported
optical metrics are not invented; runtime/assets and all versions are unchanged.
