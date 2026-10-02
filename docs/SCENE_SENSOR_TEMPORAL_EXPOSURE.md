# Declared temporal scene radiance to sensor EQE

Release context: **package 1.0.1 candidate / root API 1.0.1**. Subsystem/model versions and dated introduction or measurement records below are independent historical identities; they are not distribution versions. See [developer navigation](DEVELOPERS.md) and [release contract](RELEASE_1_0_1.md).

`calculateSceneSensorEqeTemporalExposure()` composes the existing scene-to-sensor
optical quadrature and temporal EQE calculation. It evaluates optics, response
compatibility, per-bin operating range and EQE **at every local shutter midpoint**
before integrating rates with seconds-valued measures. It never averages light
first and uses that average to hide an invalid bright instant.

## Input and binding

`sensor` is `CalculateSensorEqeTemporalExposureInput` without `samples`. Its
aperture/AA, CFA/site/native registration and spectral response inputs own both
quadrature plans. There is no independent caller-supplied optical plan that can
drift from the sensor plan. `sceneBindings` and `optics` retain the static
optical bridge's provider/material/illumination, working-f-number, transmission,
filter and field-throughput validation.

`timeReference` must explicitly be `first-opening-boundary-phase`. Each temporal
sample has `temporalSampleIndex`, `timeSecondsFromOpeningReference` and complete
`sceneSamples` in the existing optical quadrature shape. Every scene request
timestamp must equal this local midpoint on the same declared reference. Scene
query seconds are explicitly bound to that opening boundary by this composition;
readout time or renderer frame time is not substituted. The temporal sensor
calculator verifies the exact midpoint against the resolved local shutter window,
including rolling offsets, with its existing representability checks.

Indices must uniquely cover 1–256 temporal samples. Array order is not identity.
The shared internal temporal preflight checks the aggregate 100,000 declared
spatial × spectral × temporal node budget before optical calculations. The
existing optical binder separately checks exact Cartesian coverage. Scene
`sampleId` values must be unique across all instants as well as within an instant;
reusing an earlier query identity for a new time is rejected.

Output from optics remains **sensor-package-incident, pre-stack/pre-AA W/m²/nm**.
The response application must explicitly declare that plane and the selected
effective response must support it. This API cannot relabel light as site-incident
or silently add stack attenuation already included in package-effective EQE.

## Output and downstream handoff

The approximation envelope retains canonical `opticalSamples` with child optical
and provider binding evidence, and an `exposure` temporal EQE envelope with
independent instantaneous sensor evidence. Child diagnostic reductions are not
extra signal contributions: do not add them or multiply their measures twice.

For compact RAW photo commitment, pass the retained irradiance samples to the
existing creator, which independently revalidates the temporal physical input:

```ts
const scene = calculateSceneSensorEqeTemporalExposure(input);
const photo = createSensorEqeTemporalPhotoSignal({
  temporalIntegrationId: "capture-site-temporal-001",
  exposure: {
    ...input.sensor,
    samples: scene.value.opticalSamples.map(sample => ({
      temporalSampleIndex: sample.temporalSampleIndex,
      timeSecondsFromOpeningReference: sample.timeSecondsFromOpeningReference,
      irradianceSamples: sample.optics.value.irradianceSamples
    }))
  }
});
```

Use `photo.value.photoSignal` with separately calculated exact-event dark charge,
charge completeness/capacity evidence and existing RAW/noise/readout inputs.
Revalidation is not a second exposure contribution; use only one photo signal.
The paired exporter continues to derive JPEG from the exact attached native RAW.

## Limits and compatibility

Provider results, targets and visibility remain declared approximations. The
engine does not invoke a renderer, intersect scene geometry or redistribute PSF
energy here. `sourceTargetProjectionVerified`, `sceneProviderExecutionVerified`
and `psfRedistributionApplied` remain false. No calibration, combined uncertainty,
convergence bound, physical accuracy, full-resolution/editor acceptance or
production-stage activation is inferred. Requested missing capabilities still
block in the production graph. The historical introduction left #16/#178/#112 open. They are now merged for their bounded scope; the full feature/science checklist is 32/32.

This additive public API advances root API **0.110.0 → 0.111.0**, model 0.1.0.
Package, POC, production, capture/RAW and noise/readout versions stay unchanged.
Existing temporal validation diagnostics/arithmetic and historical file replay
remain unchanged. New capture commitments receive the new root API stamp.
Tests use Photivra-owned synthetic evidence, not third-party calibration. No new
dependency, asset, network operation or cost is introduced.
