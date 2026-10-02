# Temporal EQE photo signal to native RAW

Release context: **package 1.0.1 candidate / root API 1.0.1**. Subsystem/model versions and dated introduction or measurement records below are independent historical identities; they are not distribution versions. See [developer navigation](DEVELOPERS.md) and [release contract](RELEASE_1_0_1.md).

Root API **0.110.0** adds `createSensorEqeTemporalPhotoSignal()` and
`parseSensorEqeTemporalPhotoSignal()`. RAW producer result schema is **0.3.0**.
The compact `eqe-temporal-photo-signal` record enters the existing dark-current,
accumulated-charge, capacity, stochastic readout and paired DNG/JPEG path.
The full `eqe-temporal-quadrature-expected-counts` diagnostics remain distinct;
casting or relabeling them is not an accepted handoff.

## Construction and arithmetic

Supply a public, nonpersonal `temporalIntegrationId` and an `exposure` request
for [`calculateSensorEqeTemporalExposure()`](SENSOR_EQE_TEMPORAL_EXPOSURE.md).
The creator evaluates that physical input again, checking response applicability
and operating range at every time. It returns owned, frozen `photoSignal` plus
the full `exposure` child envelope retaining evidence and uncombined uncertainty.
No runtime dependency, third-party code/data or new cost is introduced.

The compact record retains the exact site/channel/binding and local shutter
start/end/duration, untreated photo-only flags, and 1–256 ordered samples of
photon/electron rates in s^-1 at exact uniform midpoints. It has no stationarity
ID, constant-photo-rate field or stationarity claim. The parser recomputes
compensated sums of rate times `duration / sampleCount` in seconds and requires
exact count agreement. It rejects unknown fields, sparse arrays, invalid public
identities, nonfinite/negative values, stale midpoint times, electron rates
above photon rates, invalid evidence and sampled/processed substitutions.
Shared accumulation arithmetic prevents calculator/parser drift.

```ts
const temporal = createSensorEqeTemporalPhotoSignal({
  temporalIntegrationId: "exposure-1-site-0",
  exposure: temporalEqeInput
});
const photoSignal = temporal.value.photoSignal;
const darkCharge = calculateSensorDarkCurrentCharge({
  exposure: photoSignal, darkCurrentProfile, operatingTemperatureC
}).value;
const charge = { photoSignal, darkCharge, completenessProfile };
// Supply the same exact event for every native site before RAW production.
// simulateSensorRawFrame({ frame, sites, exposureWindow }) feeds paired export.
```

## Event and scientific boundaries

Temporal dark charge carries the same `temporalIntegrationId`, never a fabricated
stationarity ID. Dark current still uses the supplied fixed operating temperature
and existing exact-temperature/interpolated profile rate times duration. Heating
or varying temperature within an exposure is not integrated. Accumulated charge
requires exact agreement of site/channel/binding, identity and start/end/duration;
completeness/additional components and physical capacity remain separate gates.
Both global windows and supported one-to-one rolling windows use the existing
RAW timing calculation. Orientation never changes native seed ownership.

The handoff validates arithmetic and declarations; an identity or evidence
reference does not prove optical-source execution, authenticity or calibration.
The instantaneous EQE model assumes applicability at each time without detector
lag/hysteresis. Midpoint samples can miss short pulses/discontinuities and give
no automatic convergence bound. No combined uncertainty is inferred. Source
transport, projection, PSF, production-stage activation, high-resolution execution
and external-editor acceptance remain separate #16/#178/#112 work. The 25/32 V1
tracker count and umbrella status are unchanged.

## Compatibility and acceptance

Existing stationary photo/dark inputs remain accepted with their original result
shapes, dark/charge model 1.0.0 and arithmetic. Narrow stationary calls retain
their original TypeScript evidence shape through overloads and default generic
types. `ComposeSensorPhotoAccumulatedChargeInput` and
`SensorPhotoAccumulatedChargeComposition` expose the broader contracts; union
inputs require normal type narrowing. Temporal dark/charge composition uses model **1.1.0** and
the compact creator model is **0.1.0**. Capture noise model **0.2.0**, RAW readout
model **2.0.0**, package/POC/production/RAW-frame schemas and stochastic seed
schedule are unchanged. New capture provenance includes the new root stamp;
historical capture replay and pinned paired-file hashes retain their stored stamp.

[`test/temporal-photo-raw.test.ts`](https://github.com/Photivra/photivra/blob/main/test/temporal-photo-raw.test.ts) independently
calculates SI photoelectron counts from two changing irradiance instants and
checks dark/total counts, global/rolling events, deterministic RAW, exact DNG strip
codes and JPEG lineage from the same frame. Malformed records and stale downstream
bindings fail closed. Fixtures are owned synthetic regression data, not measured
camera calibration or final V1 acceptance.
