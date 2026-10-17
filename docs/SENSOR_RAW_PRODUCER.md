# Capture-owned native sensor RAW producer

> **Release context.** This page was written for package 1.2.0 (root API 1.2.0) and has not been re-reviewed for later releases. The [changelog](../CHANGELOG.md) describes the current release. Model and subsystem version numbers on this page, and any dated records, are separate from the package version. See also the [developer guide](DEVELOPERS.md) and the [1.2.0 release contract](RELEASE_1_2_0.md).

`simulateSensorRawFrame()` turns per-site expected charge into RAW codes. It is the engine's own RAW producer: it computes the codes, instead of accepting codes made up by the caller.

See [Reference RAW frame compatibility](RAW_FRAME_ENVELOPE.md) for the limits of each stage, how full-native sites are counted, and how the parser checks input up front.

The sections below describe the current behaviour first, then the changes made in each version.

## What the producer does

`simulateSensorRawFrame()` connects the existing sensor contracts for charge, capacity, random realisation and readout to `createSensorRawFrame()`.

- It computes codes. It does not accept invented site codes, and does not mask an independent RGB image.
- The returned frame feeds the existing same-RAW reconstruction and `createPhotographicExportPair()`, with no second ADC quantisation or random-number pass.
- This closes one bounded handoff gap. It is not the complete physical production composer, and does not complete export (issue #16) or V1 acceptance.

### Input

The input has:

- `frame`: the existing RAW-frame metadata and profile input, without samples;
- `sites`: one entry per site, in full native row-major order, at most 4,096 sites.

Restrictions:

- Only single-frame, native-effective, periodic CFA (colour filter array) input is accepted, with exactly one native sample per colour site.
- Grouped, remosaiced and multi-frame acquisition is rejected.
- Full native coverage does not change with active crop, output crop or orientation.

Each site provides:

- untreated EQE (external quantum efficiency) photo and dark exposure results;
- additional charge and completeness inputs;
- charge sampling and capacity profiles;
- an explicit operating state;
- an explicit readout profile and regime.

No profile is inferred from ISO, or copied from a different channel or site.

### Input checks

- New fields and photo/dark result fields are checked against allow-lists.
- Evidence is normalised through the existing provenance parsers. Existing profile and completeness rules are handled by their existing parsers.
- Runtime checks reject:
  - substitutions that are already sampled, clipped, ADC-converted, white-balanced or processed;
  - charge from A/W (current) responsivity;
  - inconsistent constant-rate products, or inconsistent temporal rate integrals;
  - missing, reordered or sparse sites;
  - stale CFA, channel or event identity.
- A stationarity or completeness declaration is evidence from the upstream producer. It is not independent proof that the pixel values are true.
- In the incident-count domain, expected photoelectrons must not exceed expected photons. Effective-gain or carrier models outside that EQE domain need a separate contract.

### Exposure timing

**Default: global exposure window.** If `exposureWindow` is omitted, every local window runs exactly from 0 to the committed `shutterSeconds`, measured from `first-opening-boundary-phase`, with the exact nominal duration and a site binding ID.

**Explicit window.** An explicit `exposureWindow` supplies the shutter mechanism, a sourced nominal duration, and opening and closing schedules from the existing exposure-window contract.

- The nominal duration must exactly match the committed `shutterSeconds`.
- The producer owns the full native timing rectangle and the row-major sample centres `(x+0.5,y+0.5)`. A raster, active crop or sample coordinates from the caller are rejected.
- The edge travel across the full native area must be supplied explicitly. An active crop never scales it.
- The existing engine timing calculation checks the affine extremes over the whole native rectangle, and computes each site's local start, end and duration.
- Every photo, dark, additional-charge and completeness event must match that exact site window.
- Stationarity is still declared per local event; it is never concluded from rolling timing.
- The optional `localExposureWindows` child result keeps the timing assumptions, evidence and computed windows.

**Scope.** This accepts per-site photo expectations that are stationary, or explicitly integrated over time, under simultaneous or uniform-linear edges (electronic, mechanical or EFCS). It does not:

- run moving or time-varying scene transport;
- predict rolling-shutter geometry;
- synchronise data readout;
- turn on reserved production stages.

Multi-frame and non-one-to-one timing are unsupported.

The RAW-frame schema and export metadata are unchanged. `shutterSeconds` is nominal; it does not claim that every local site duration equals it. If you need evidence to replay the local windows, store the producer's timing result separately. Timing evidence and the origin of upstream charge are declarations by the caller, not independently verified transport truth.

Capacity uses the dark result's temperature and the explicit operating state, independently of ISO. The engine re-adds the total photo, dark and additional expectations, and checks evidence-backed completeness, before assessing capacity.

Example timing override (schedules refer to the full native raster):

```ts
const result = simulateSensorRawFrame({
  frame,
  sites, // Each declared charge event must already match its computed local window.
  exposureWindow: {
    shutterMechanism: "electronic",
    nominalExposureDurationSeconds: { value: frame.capture.exposure.shutterSeconds, unit: "s", evidence },
    opening: {
      kind: "uniform-linear-native-scan",
      directionNative: { value: "top-to-bottom", evidence },
      traversalDurationSeconds: { value: 0.001, unit: "s", evidence }
    },
    closing: {
      kind: "uniform-linear-native-scan",
      directionNative: { value: "top-to-bottom", evidence },
      traversalDurationSeconds: { value: 0.001, unit: "s", evidence }
    }
  }
});
```

The 1 ms travel time is an illustrative declared approximation, not camera calibration. Changing it requires matching per-site exposure results; this API does not rescale old charge counts.

### Noise and seeds

- The capture noise model must equal `SENSOR_RAW_PRODUCER_NOISE_MODEL` (`photivra-native-raw-noise`, version 0.4.0). The noise realisation ID does not change.
- The versioned seed schedule (`murmur3-capture-seed-native-index-stream-v2`) hashes the capture seed, the absolute native row-major index n, and a stream ID (0 for charge, 1 for read noise) with MurmurHash3_x86_32. See [Independent per-site noise streams](#independent-per-site-noise-streams--issue-270-200) below.
- Both identities are stored per RAW site.
- The hash gives deterministic ownership of seeds. Independence of the streams is checked statistically by regression tests; the hash alone does not imply it.
- The existing Poisson and normal samplers are reused, with their existing numerical and model limits.
- No backend or global randomness is used.

### Order of operations

The producer calls existing APIs in this order:

1. accumulated-charge completeness;
2. physical-capacity assessment;
3. random charge realisation;
4. scalar physical saturation;
5. read noise;
6. pre-ADC saturation;
7. conversion gain;
8. ADC quantisation and digital clamp;
9. native CFA sample;
10. immutable frame.

Rules:

- Expected charge is never overwritten by realised or clipped charge.
- Physical scalar saturation, pre-ADC saturation, lower-code clamp and digital saturation, the overflow diagnostics, and child provenance are all kept separate.
- Scalar saturation is the existing approximation. It is not a model of blooming or charge transfer to neighbours.
- Capacity uncertainty is not propagated into random saturation or output codes.

### Readout profiles and storage

- All sites share the frame contract's readout profile ID and regime. Channel-specific profile data stays explicitly bound to its own channel.
- The original per-channel profiles are revalidated for each site. They are never copied from one channel to another.
- Uint16 storage needs an ADC depth of at most 16 bits, and a positive span from black to digital white.
- Larger, or varying, readout identities or regimes need a separate RAW-frame schema. The producer does not get around those limits.

### Result

Result schema 0.3.0 declares:

- `codeProducer: "engine-charge-capacity-noise-adc"`;
- `upstreamOrigin: "declared-eqe-and-dark-exposure-results"`;
- `upstreamRadiometryVerified:false`.

Child results keep their own evidence and status. The overall provenance is approximation.

The existing attachment keeps `producerBinding:"caller-declared-capture-attachment"` for compatibility. A structurally valid frame is not cryptographic evidence that the upstream steps ran. Replaying a frame from an archive does not prove it came from the engine, and downstream export's conservative origin-verification flag stays false.

**Float planes.** The capture's independent float image planes are not RAW inputs. They are not replaced, and the engine does not claim to reconstruct them from the generated RAW. The same-RAW exporter must use the returned frame; its JPEG comes from exactly those stored codes. Capture exposure, focus, source, noise and geometry are unchanged. This adapter claims no prepared production context and no physical scene radiance.

### Tests

The tests:

- compare every generated site independently against the existing per-site primitives;
- check the deterministic hashed seed schedule at the uint32 seed limit;
- check the native CFA through all orientations;
- keep the saturation stages separate;
- reject stale, already-treated and missing inputs;
- inspect DNG strip bytes from generated RAW, and a deterministic same-RAW JPEG.

The synthetic fixture data (EQE, dark charge, counts, capacity and readout) was written independently. It is not a measured calibration or an externally validated radiance pipeline. No runtime dependency, third-party code or data, or new cost is added.

### Irradiance-to-photo-exposure composition

[`calculateSensorEqeLocalExposure()`](SENSOR_EQE_LOCAL_EXPOSURE.md) produces the existing `charge.photoSignal` value from explicit irradiance nodes, through response validity, EQE and stationary local integration. It keeps the detailed child records, and declares the scene and optics origin unverified. Dark charge, completeness and readout inputs stay explicit. This does not turn on production stages or change the producer schema.

## Version history

### Noise model 0.4.0, ISO gain and fixed-pattern noise (2.0.0)

The capture noise model `photivra-native-raw-noise` is now **0.4.0**. Replays that carry 0.1.0–0.3.0 fail closed (are rejected). It binds:

- exact ties-up ADC rounding (`Math.round`; `floor(x + 0.5)` returned 1 for 0.49999999999999994);
- a continuity-corrected normal approximation for Poisson means of 1e9 and above;
- optional post-ADC `adc.digitalGain` and `adc.integralNonLinearity` on a regime;
- an optional per-site `fixedPatternNoise` profile.

Provenance models are `sensor-charge-stochastic-realization` **3.0.0**, `sensor-raw-code-stochastic-readout` **4.0.0** and `sensor-expected-electronic-readout` **2.0.0**.

Realised codes are unchanged from 0.3.0, except for exact-tie rounding artefacts, when all of these hold: means are below 1e9, the regime has no digital gain or INL, and the site has no fixed pattern.

**Fixed pattern.** A site can carry `fixedPatternNoise`. If one does, every site of the frame must carry the same profile ID and sensor-instance seed (or none must).

- PRNU and DSNU/hot-pixel factors scale the photo and dark Poisson means.
- Fixed row and column offsets are added with read noise.

A readout regime that records an `exposureIndexGain` must match the committed capture ISO. See [MOTION_AND_SIGNAL.md](MOTION_AND_SIGNAL.md) for the equations and sources. The browser-native reference-site path does not accept fixed-pattern profiles.

### Independent per-site noise streams — issue #270 (2.0.0)

The capture noise model `photivra-native-raw-noise` became **0.3.0**, and the producer and native RAW `seedSchedule` is `murmur3-capture-seed-native-index-stream-v2`.

For the absolute full-native row-major index n:

- the charge seed is `MurmurHash3_x86_32([capture.seedUint32, n, 0])`;
- the read-noise seed is `MurmurHash3_x86_32([capture.seedUint32, n, 1])`.

Each message is three little-endian uint32 words, hashed with seed 0 (`src/sensor/stochastic-seed.ts`). The xorshift32 stream inside `simulateSensorChargeRealization()` and `simulateSensorRawCode()` also scrambles its seed with the MurmurHash3 `fmix32` finaliser before its first step. Their provenance models are `sensor-charge-stochastic-realization` **2.0.0** and `sensor-raw-code-stochastic-readout` **3.0.0**.

**Why.** The previous schedule (`capture seed + 2n` and `+ 2n + 1`, fed to xorshift32 through an affine XOR) gave neighbouring sites almost the same first random draw.

- Realised noise had a lag-1 correlation near 0.8.
- Shot-noise variance was about a fifth of the Poisson value.
- Captures with seeds s and s+2 were shifted copies of each other.

That contradicted the Poisson photon-transfer model ([EMVA 1288 Release 4.0 Linear](https://www.emva.org/wp-content/uploads/EMVA1288Linear_4.0Release.pdf) §2.4, free. Also see: Janesick, *Photon Transfer*). Expected charge, the Poisson and normal samplers, ADC arithmetic and every saturation rule are unchanged.

**Breaking.** Realised RAW codes and recorded per-site seed identities change for every seed. Replay requests that carry noise model 0.1.0 or 0.2.0 fail closed. To recompute, recreate the capture with model 0.3.0, keep its original seed, and keep the old artifacts as historical output.

Seeds are still deterministic: the same seed, input and absolute site index give the same codes, whatever the execution chunk or tile width. The hash is a non-cryptographic way to own seeds.

`test/sensor-raw-noise-independence.test.ts` checks, on the production native RAW path: per-phase Poisson and Gaussian moments, spatial and same-colour neighbour correlation, and independence between nearby capture seeds. These are fixed-seed regression checks on owned synthetic fixtures, not a calibration claim.

### Temporal photo signal — root API 0.110.0

Producer result schema **0.3.0** accepts both the original stationary EQE result and the separate compact `eqe-temporal-photo-signal` record. The temporal record requires:

- validated, ordered midpoint rates and exact count sums;
- no stationarity fields;
- a matching `temporalIntegrationId` on the dark charge.

See [TEMPORAL_PHOTO_RAW.md](TEMPORAL_PHOTO_RAW.md) for construction, type compatibility, acceptance of global and rolling paired files, and scientific limits. Noise and readout identities, native seeds and stationary arithmetic are unchanged.

### Signed electronic shadows — root API 0.106.0

The required capture model `photivra-native-raw-noise` became **0.2.0**. It kept the per-site seed schedule of that time, and bound the corrected readout behaviour. `simulateSensorRawCode()` provenance uses `sensor-raw-code-stochastic-readout` model **2.0.0**.

**The rule.**

- Physical stored charge is never negative.
- After Gaussian electronic read noise is added, the signal can be negative.
- Then apply only the upper pre-ADC saturation threshold, then conversion gain and the black pedestal, round-half-up quantisation, and a clamp to `[0, digitalSaturationCode]`.
- Integer codes below black survive when they fit in the unsigned ADC range.
- `lowerCodeClampApplied` is true only when the quantised code is below zero.
- A negative electronic signal is not negative stored charge, and not physical saturation.

**What changed.** Earlier behaviour clamped the electronic signal to zero before adding the black pedestal. That biased the shadows, and made below-black producer values impossible. Positive electronic signals keep their code arithmetic, but result provenance and capture noise identities change.

**Migration.** Replay requests that carry producer noise model 0.1.0 fail closed. For a deliberate recomputation:

- recreate the capture with model 0.2.0;
- keep its original seed;
- keep the old artifact as historical output;
- record the changed model and API identity.

Do not relabel old codes as newly generated codes. Existing archived RAW-frame attachments are a separate structural contract, and are not automatically regenerated by this correction. Producer, profile and frame schema versions, and package and POC versions, did not change.

### Exposure timing handoff — root API 0.104.0

This addition moved the root API from 0.103.0 to 0.104.0, and the producer result schema from 0.1.0 to 0.2.0. Existing input without timing stays valid, with identical RAW codes and seed ownership. Package, POC, capture, RAW-frame, production and noise-schedule versions did not change.

Human review of science and provenance, and new DCO certification for the contribution, are required. Remaining work includes:

- independently bound production input from scene and spectral response to exposure;
- source execution and PSF;
- activation of reserved production stages;
- broader output sampling support;
- high-resolution limits;
- acceptance in Adobe and open-source editors.

None of these is marked complete here.
