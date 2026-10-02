# Capture-owned native sensor RAW producer

`simulateSensorRawFrame()` connects existing sensor charge/capacity/stochastic/readout contracts to `createSensorRawFrame()`. It computes codes rather than accepting fabricated site codes or masking an independent RGB plane. The returned frame feeds existing same-RAW reconstruction and `createPhotographicExportPair()` without another ADC quantization or RNG pass. This closes a bounded producer handoff gap, not the complete physical production composer or #16/V1 acceptance.

Input has `frame` (the existing RAW-frame metadata/profile input without samples) and dense `sites` in full native row-major order, limited to 4,096 sites. Only single-frame native-effective periodic CFA with exactly one native sample per color site is accepted. Grouped/remosaiced/multi-frame acquisition is rejected. Full native coverage remains unchanged by active crop, output crop or orientation. Each site provides untreated EQE photo/dark exposure results, additional charge/completeness inputs, charge sampling and capacity profiles, explicit operating state, explicit readout profile and regime. No profile is inferred from ISO or copied from a different channel/site.

The parser checks new fields and photo/dark result fields against allowlists, normalizes evidence through existing provenance parsers, and delegates existing profile/completeness rules to their existing parsers. Runtime checks reject already sampled/clipped/ADC/WB/processed substitutions, A/W charge, inconsistent constant-rate products, missing/reordered/sparse sites and stale CFA/channel/event identity. A stationarity/completeness declaration remains evidence supplied by the upstream producer, not independent verification of pixel truth. The incident-count domain requires expected photoelectrons not exceed expected photons; effective gain/carrier models outside that EQE domain require a separate contract.

Omitting `exposureWindow` preserves **global stationary exposure**: all local windows are exactly 0 to committed `shutterSeconds` from `first-opening-boundary-phase`, with exact nominal duration and site binding ID.

An explicit `exposureWindow` supplies shutter mechanism, sourced nominal duration, and opening/closing schedules from the existing exposure-window contract. Nominal duration must exactly match committed `shutterSeconds`. The producer owns the full native timing rectangle and row-major sample centers `(x+0.5,y+0.5)`; caller-supplied raster, active crop or sample coordinates are rejected. Full-native boundary traversal must be supplied explicitly; an active crop never scales it. The existing engine timing calculation validates affine extrema over the entire native rectangle and computes each local start/end/duration. Every photo/dark/additional/completeness event must match that exact site window. Stationarity remains a declaration for each local event, not a conclusion from rolling timing. The optional `localExposureWindows` child result preserves timing assumptions, evidence and computed windows.

This accepts stationary per-site exposure expectations under simultaneous or uniform-linear electronic/mechanical/EFCS boundaries; it does not integrate moving/time-varying scene radiance, predict rolling-shutter geometry, synchronize data readout, or activate reserved production stages. Multi-frame and non-one-to-one timing remain unsupported. The RAW-frame schema and export metadata remain unchanged: `shutterSeconds` is nominal, not a claim that every local site duration equals it. Persist the producer timing result separately when local-window replay evidence is required. Timing evidence and upstream charge origin remain caller declarations, not independently verified transport truth. Capacity uses the supplied dark-result temperature and explicit operating state, independently from ISO. The engine re-composes total photo/dark/additional expectations and checks evidence-backed completeness before assessing capacity.

Capture noise model must equal `SENSOR_RAW_PRODUCER_NOISE_MODEL` (`photivra-native-raw-noise`, version 0.1.0). Noise realization ID stays unchanged. The versioned seed schedule is charge seed `(capture.seedUint32 + 2*n) mod 2^32`, read-noise seed `(capture.seedUint32 + 2*n + 1) mod 2^32`, for native row-major index n. Both identities are preserved per RAW site, including unsigned wrap. Seeds are distinct within a frame; this is deterministic ownership, **not proof of statistical stream independence**. Existing Poisson and normal sampling implementations are reused, with their existing numerical/model limitations. No backend/global randomness is used.

Order delegates to existing APIs: accumulated-charge completeness → physical-capacity assessment → stochastic charge realization → scalar physical saturation → read noise → pre-ADC saturation → conversion gain → ADC quantization/digital clamp → native CFA sample → immutable frame. Expected charge is never overwritten by realized/clipped charge. Physical scalar, pre-ADC, lower-code and digital saturation, overflow diagnostics and child provenance remain separate. Scalar saturation is the existing approximation, not a blooming/neighbor-transfer model. Capacity uncertainty is not propagated into stochastic saturation or output codes.

All sites share the existing frame contract's readout profile ID/regime; channel-specific profile payloads remain explicitly bound to their respective channels. The original per-channel profiles are revalidated for each site, never rewritten from one channel to another. Uint16 storage requires ADC depth ≤16 and a positive black-to-digital-white span. Larger or varying readout identity/regime contracts need a separate RAW-frame schema; the producer does not bypass those constraints.

Result schema 0.2.0 declares `codeProducer: "engine-charge-capacity-noise-adc"`, `upstreamOrigin: "declared-eqe-and-dark-exposure-results"`, `upstreamRadiometryVerified:false`. Child results preserve their own evidence/status; aggregate provenance is approximation. The existing attachment retains `producerBinding:"caller-declared-capture-attachment"` for compatibility: structural frame validity is not cryptographic evidence of upstream execution. Archive replay of a frame does not establish engine origin; downstream export's conservative origin-verification flag stays false.

Independent float capture planes are not RAW inputs, are not replaced, and are not claimed reconstructed from generated RAW. The same-RAW exporter must consume the returned frame, whose JPEG derives from those exact stored codes. Capture exposure/focus/source/noise/geometry remain intact; no prepared production context or physical scene radiance is claimed by this adapter.

Tests independently compare every generated site with existing per-site primitives, verify deterministic unsigned seed wrap and native CFA through all orientations, separate saturation stages, reject stale/treated/missing inputs and inspect DNG strip bytes from generated RAW plus deterministic same-RAW JPEG. Synthetic fixture EQE/dark/count/capacity/readout data is independently authored, not a measured calibration or externally validated radiance pipeline. No runtime dependency, third-party code/data or new cost is added.

This additive timing handoff updates root API 0.103.0 → 0.104.0 and producer result schema 0.1.0 → 0.2.0. Existing input without timing remains valid with identical RAW codes/seed ownership. Package/POC/capture/RAW-frame/production and noise schedule versions are unchanged. Human science/provenance review and new contribution-specific DCO are required. Remaining work includes independently bound scene/spectral-response→exposure production input, time-varying local radiance integration, reserved production-stage activation, broader output sampling support, high-resolution limits and Adobe/open-editor acceptance. None is marked complete here.

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
