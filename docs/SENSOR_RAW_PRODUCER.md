# Capture-owned native sensor RAW producer

Release context (dated historical note): written for the **package 1.2.0 candidate / root API 1.2.0** and not re-reviewed for later releases; see the [changelog](../CHANGELOG.md) for the current release. Subsystem/model versions and dated introduction or measurement records below are independent historical identities; they are not distribution versions. See [developer navigation](DEVELOPERS.md) and [release contract](RELEASE_1_2_0.md).

See [Reference RAW frame compatibility](RAW_FRAME_ENVELOPE.md) for stage-specific
limits, full-native counting and parser preflight behavior.

## Noise model 0.4.0, ISO gain and fixed-pattern noise (2.0.0)

The capture noise model `photivra-native-raw-noise` is now **0.4.0**; replays carrying 0.1.0–0.3.0 fail closed. It binds:
exact ties-up ADC rounding (`Math.round`; `floor(x + 0.5)` returned 1 for 0.49999999999999994), a continuity-corrected
normal approximation for Poisson means of 1e9 and above, optional post-ADC `adc.digitalGain` and
`adc.integralNonLinearity` on a regime, and an optional per-site `fixedPatternNoise` profile. Provenance models are
`sensor-charge-stochastic-realization` **3.0.0**, `sensor-raw-code-stochastic-readout` **4.0.0** and
`sensor-expected-electronic-readout` **2.0.0**. For means below 1e9, regimes without digital gain/INL and sites without a
fixed pattern, realized codes are unchanged from 0.3.0 except at exact-tie rounding artefacts.

A site may carry `fixedPatternNoise`; every site of a frame must then carry the same profile ID and sensor-instance seed
(or none). PRNU and DSNU/hot-pixel factors scale the photo and dark Poisson means; static row/column offsets are added with
read noise. A readout regime that records an `exposureIndexGain` must match the committed capture ISO. See
[MOTION_AND_SIGNAL.md](MOTION_AND_SIGNAL.md) for the equations and sources. The browser-native reference-site path does
not accept fixed-pattern profiles.

## Independent per-site noise streams — issue #270 (2.0.0)

The capture noise model `photivra-native-raw-noise` is now **0.3.0** and the producer and
native RAW `seedSchedule` is `murmur3-capture-seed-native-index-stream-v2`. For absolute
full-native row-major index n, the charge seed is
`MurmurHash3_x86_32([capture.seedUint32, n, 0])` and the read-noise seed is
`MurmurHash3_x86_32([capture.seedUint32, n, 1])`, each message being three little-endian
uint32 words hashed with seed 0 (`src/sensor/stochastic-seed.ts`). The xorshift32 stream
inside `simulateSensorChargeRealization()` and `simulateSensorRawCode()` now also scrambles
its seed with the MurmurHash3 `fmix32` finalizer before the first step. Their provenance
models are `sensor-charge-stochastic-realization` **2.0.0** and
`sensor-raw-code-stochastic-readout` **3.0.0**.

The previous schedule (`capture seed + 2n` and `+ 2n + 1`, fed to xorshift32 through an
affine XOR) gave neighbouring sites almost identical first draws. Realized noise had lag-1
correlation near 0.8 and shot-noise variance about a fifth of the Poisson value, and
captures with seeds s and s+2 were index-shifted copies. That contradicted the Poisson
photon-transfer model (EMVA 1288 §2; Janesick, *Photon Transfer*). Expected charge,
Poisson/normal samplers, ADC arithmetic and every saturation rule are unchanged.

**Breaking:** realized RAW codes and recorded per-site seed identities change for every
seed. Replay requests carrying noise model 0.1.0 or 0.2.0 fail closed. To recompute,
recreate the capture with model 0.3.0, keep its original seed and keep old artifacts as
historical output. Seeds remain deterministic: the same seed, input and absolute site
index reproduce the same codes regardless of execution chunk or tile width. The hash is
non-cryptographic seed ownership. `test/sensor-raw-noise-independence.test.ts` checks
per-phase Poisson and Gaussian moments, spatial and same-colour neighbour correlation, and
independence between nearby capture seeds on the production native RAW path. These are
fixed-seed regression checks on owned synthetic fixtures, not a calibration claim.

## Temporal photo signal — root API 0.110.0

Producer result schema **0.3.0** accepts both the original stationary EQE result
and the distinct compact `eqe-temporal-photo-signal` record. The latter requires
validated ordered midpoint rates and exact count sums, no stationarity fields,
and matching `temporalIntegrationId` on dark charge. See
[TEMPORAL_PHOTO_RAW.md](TEMPORAL_PHOTO_RAW.md) for construction, type compatibility,
global/rolling paired-file acceptance and scientific limits. Noise/readout
identities, native seeds and stationary arithmetic are unchanged.

## Signed electronic shadows — root API 0.106.0

The required `photivra-native-raw-noise` capture model is now **0.2.0**, preserving the existing per-site seed schedule while binding corrected readout behavior. `simulateSensorRawCode()` provenance uses `sensor-raw-code-stochastic-readout` model **2.0.0**. Physical stored charge remains nonnegative; after Gaussian electronic read noise, the signal may be negative. Apply only the upper pre-ADC saturation threshold, then conversion gain and black pedestal, round-half-up quantization, and clamp to `[0, digitalSaturationCode]`. Below-black integer codes survive when they fit the unsigned ADC range. `lowerCodeClampApplied` is true only when the quantized code is below zero. A negative electronic signal is not negative stored charge or physical saturation.

Earlier behavior clamped the electronic signal to zero before adding the black pedestal, biasing shadows and making below-black producer values impossible. Positive electronic signals retain their code math, but result provenance and capture noise identities change. Replay requests carrying producer noise model 0.1.0 fail closed. For a deliberate recomputation, recreate the capture with model 0.2.0, keep its original seed, preserve the old artifact as historical output and record changed model/API identity. Do not relabel old codes as newly generated codes. Existing archived RAW-frame attachments remain a separate structural contract and are not automatically regenerated by this correction. Producer/profile/frame schema versions and package/POC versions do not change; the historical section below describes the original handoff.

`simulateSensorRawFrame()` connects existing sensor charge/capacity/stochastic/readout contracts to `createSensorRawFrame()`. It computes codes rather than accepting fabricated site codes or masking an independent RGB plane. The returned frame feeds existing same-RAW reconstruction and `createPhotographicExportPair()` without another ADC quantization or RNG pass. This closes a bounded producer handoff gap, not the complete physical production composer or #16/V1 acceptance.

Input has `frame` (the existing RAW-frame metadata/profile input without samples) and dense `sites` in full native row-major order, limited to 4,096 sites. Only single-frame native-effective periodic CFA with exactly one native sample per color site is accepted. Grouped/remosaiced/multi-frame acquisition is rejected. Full native coverage remains unchanged by active crop, output crop or orientation. Each site provides untreated EQE photo/dark exposure results, additional charge/completeness inputs, charge sampling and capacity profiles, explicit operating state, explicit readout profile and regime. No profile is inferred from ISO or copied from a different channel/site.

The parser checks new fields and photo/dark result fields against allowlists, normalizes evidence through existing provenance parsers, and delegates existing profile/completeness rules to their existing parsers. Runtime checks reject already sampled/clipped/ADC/WB/processed substitutions, A/W charge, inconsistent constant-rate products or temporal rate integrals, missing/reordered/sparse sites and stale CFA/channel/event identity. A stationarity/completeness declaration remains evidence supplied by the upstream producer, not independent verification of pixel truth. The incident-count domain requires expected photoelectrons not exceed expected photons; effective gain/carrier models outside that EQE domain require a separate contract.

Omitting `exposureWindow` preserves the **global exposure window**: all local windows are exactly 0 to committed `shutterSeconds` from `first-opening-boundary-phase`, with exact nominal duration and site binding ID.

An explicit `exposureWindow` supplies shutter mechanism, sourced nominal duration, and opening/closing schedules from the existing exposure-window contract. Nominal duration must exactly match committed `shutterSeconds`. The producer owns the full native timing rectangle and row-major sample centers `(x+0.5,y+0.5)`; caller-supplied raster, active crop or sample coordinates are rejected. Full-native boundary traversal must be supplied explicitly; an active crop never scales it. The existing engine timing calculation validates affine extrema over the entire native rectangle and computes each local start/end/duration. Every photo/dark/additional/completeness event must match that exact site window. Stationarity remains a declaration for each local event, not a conclusion from rolling timing. The optional `localExposureWindows` child result preserves timing assumptions, evidence and computed windows.

This accepts stationary or explicitly integrated temporal per-site photo expectations under simultaneous or uniform-linear electronic/mechanical/EFCS boundaries; it does not execute moving/time-varying scene transport, predict rolling-shutter geometry, synchronize data readout, or activate reserved production stages. Multi-frame and non-one-to-one timing remain unsupported. The RAW-frame schema and export metadata remain unchanged: `shutterSeconds` is nominal, not a claim that every local site duration equals it. Persist the producer timing result separately when local-window replay evidence is required. Timing evidence and upstream charge origin remain caller declarations, not independently verified transport truth. Capacity uses the supplied dark-result temperature and explicit operating state, independently from ISO. The engine re-composes total photo/dark/additional expectations and checks evidence-backed completeness before assessing capacity.

Capture noise model must equal `SENSOR_RAW_PRODUCER_NOISE_MODEL` (`photivra-native-raw-noise`, version 0.4.0). Noise realization ID stays unchanged. The versioned seed schedule (`murmur3-capture-seed-native-index-stream-v2`) hashes the capture seed, absolute native row-major index n and stream ID (0 charge, 1 read noise) with MurmurHash3_x86_32; see the #270 section above. Both identities are preserved per RAW site. The hash is deterministic ownership; stream independence is checked statistically by the #270 regression tests, not implied by the hash. Existing Poisson and normal sampling implementations are reused, with their existing numerical/model limitations. No backend/global randomness is used.

Order delegates to existing APIs: accumulated-charge completeness → physical-capacity assessment → stochastic charge realization → scalar physical saturation → read noise → pre-ADC saturation → conversion gain → ADC quantization/digital clamp → native CFA sample → immutable frame. Expected charge is never overwritten by realized/clipped charge. Physical scalar, pre-ADC, lower-code and digital saturation, overflow diagnostics and child provenance remain separate. Scalar saturation is the existing approximation, not a blooming/neighbor-transfer model. Capacity uncertainty is not propagated into stochastic saturation or output codes.

All sites share the existing frame contract's readout profile ID/regime; channel-specific profile payloads remain explicitly bound to their respective channels. The original per-channel profiles are revalidated for each site, never rewritten from one channel to another. Uint16 storage requires ADC depth ≤16 and a positive black-to-digital-white span. Larger or varying readout identity/regime contracts need a separate RAW-frame schema; the producer does not bypass those constraints.

Result schema 0.3.0 declares `codeProducer: "engine-charge-capacity-noise-adc"`, `upstreamOrigin: "declared-eqe-and-dark-exposure-results"`, `upstreamRadiometryVerified:false`. Child results preserve their own evidence/status; aggregate provenance is approximation. The existing attachment retains `producerBinding:"caller-declared-capture-attachment"` for compatibility: structural frame validity is not cryptographic evidence of upstream execution. Archive replay of a frame does not establish engine origin; downstream export's conservative origin-verification flag stays false.

Independent float capture planes are not RAW inputs, are not replaced, and are not claimed reconstructed from generated RAW. The same-RAW exporter must consume the returned frame, whose JPEG derives from those exact stored codes. Capture exposure/focus/source/noise/geometry remain intact; no prepared production context or physical scene radiance is claimed by this adapter.

Tests independently compare every generated site with existing per-site primitives, verify the deterministic hashed seed schedule at the uint32 seed limit and native CFA through all orientations, separate saturation stages, reject stale/treated/missing inputs and inspect DNG strip bytes from generated RAW plus deterministic same-RAW JPEG. Synthetic fixture EQE/dark/count/capacity/readout data is independently authored, not a measured calibration or externally validated radiance pipeline. No runtime dependency, third-party code/data or new cost is added.

This additive timing handoff updates root API 0.103.0 → 0.104.0 and producer result schema 0.1.0 → 0.2.0. Existing input without timing remains valid with identical RAW codes/seed ownership. Package/POC/capture/RAW-frame/production and noise schedule versions are unchanged. Human science/provenance review and new contribution-specific DCO are required. Remaining work includes independently bound scene/spectral-response→exposure production input, source execution and PSF, reserved production-stage activation, broader output sampling support, high-resolution limits and Adobe/open-editor acceptance. None is marked complete here.

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

The 1 ms traversal is an illustrative declared approximation, not camera calibration. Changing it requires corresponding per-site exposure results; this API does not rescale old charge counts.

## Irradiance-to-photo-exposure composition

[`calculateSensorEqeLocalExposure()`](SENSOR_EQE_LOCAL_EXPOSURE.md) now produces the existing `charge.photoSignal` value from explicit irradiance nodes through response validity, EQE and stationary local integration. It retains child envelopes and declares scene/optics origin unverified. Dark/completeness and readout inputs remain explicit; this does not activate production stages or change the producer schema.
