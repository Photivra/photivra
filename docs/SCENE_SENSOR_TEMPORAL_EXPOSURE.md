# Declared temporal scene radiance to sensor EQE

Release context (dated historical note): written for the **package 1.2.0 candidate / root API 1.2.0** and not re-reviewed for later releases; see the [changelog](../CHANGELOG.md) for the current release. Subsystem/model versions and dated introduction or measurement records below are independent historical identities; they are not distribution versions. See [developer navigation](DEVELOPERS.md) and [release contract](RELEASE_1_2_0.md).

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

## Flash: guide number, TTL and high-speed sync

All three are approximations in the relative domains the engine already uses; no vendor TTL algorithm,
zone-weighting table, pulse curve or flash protocol is reproduced. Flash/TTL metering stays separate from
ambient metering: the ambient meter result is an input and is never modified.

### Guide number

```text
GN = d · N                       (correct flash exposure at distance d and f-number N)
GN(p, ISO) = GN_full · √p · √(ISO/100)
p(d) = (d · N / (GN_full · √(ISO/100)))²,  clamped to [p_min, 1]
```

The relation follows from the inverse-square law (subject illuminance ∝ 1/d²) and the camera equation (sensor
exposure ∝ 1/N²); emitted energy scales with the power fraction `p`. ISO 2827 specifies how a guide number
is measured; Jacobson et al., *The Manual of Photography*, and Ray, *Applied Photographic Optics*, give the
relation. `calculateFlashGuideNumber()` and `calculateFlashPowerForDistance()` implement it; the latter reports
the clamp status, the delivered-minus-required error in stops and the full-power range `GN/N`.

### TTL with a pre-flash

`resolveTtlFlashExposure()` (`preflash-linear-ttl` 1.0.0) takes two measurements of the same zones with the
existing relative meter: ambient only, and ambient plus a pre-flash at the known power fraction `p_pre`.

```text
f_i  = pre_i − ambient_i                  flash-only signal per zone (must be ≥ 0)
A    = M(ambient),  F = M(f) / p_pre      M = the profile's metering policy (linear policies only)
k    = ambient integration in the main exposure / in the measurement window (same aperture and ISO)
T'   = target · 2^FEC
p    = (T' − k·A) / (F · s),  clamped to [p_min, 1];  s = 1 (front/rear curtain) or η·t_e/D (HSS)
```

Uniform, centre-weighted and spot metering are linear in the zone signals, so the metered total of the main
exposure is exactly `k·A + p·F·s`. Highlight policies are rejected because their weights depend on the
signal. The result reports `resolved`, `clamped-at-minimum-power` (ambient alone may already reach the
target), `clamped-at-full-power` with the predicted exposure error, or `no-flash-return`; it also reports the
effective guide number and flash range when a guide number is supplied. The pre-flash precedes the main
exposure, so movement and ambient change between them are outside the model.

`createTtlScaledFlashProfile()` scales a `ManualFlashProfile` by the solved power; the scaled profile is then placed
by the existing `resolveManualFlashSync()` exactly as before. Front- and rear-curtain sync differ only in
where the same pulse lies inside the whole-frame-open interval, so TTL power and sync timing stay independent.
For HSS pass the unscaled profile and the TTL power fraction to `resolveHighSpeedFlashSync()`.

### High-speed sync

When the opening and closing boundaries traverse the frame faster than the exposure, no instant exposes the
whole frame and a single pulse would light only a band (ordinary sync still fails closed). High-speed (focal
plane) sync emits a rapid pulse train that behaves as constant output over the whole travelling-slit
exposure. `resolveHighSpeedFlashSync()` (`flash-hss-quasi-continuous-burst` 1.0.0) requires a schema 0.2.0
sync-capability profile that declares HSS and the burst energy fraction `η` (energy of a full-power burst
relative to one full-power ordinary pulse, from evidence; it absorbs capacitor and thermal limits).

Derivation. Let `E_pulse = ∫ pulse(t) dt` be the full-power ordinary pulse energy (relative units) and
`D = T + τ_close` the burst support from the first line opening to the last line closing. At power `p` the
burst carries `E_burst = η·p·E_pulse` at constant output `P = E_burst / D`. A line whose slit is open for
`t_e` integrates `P·t_e`:

```text
line energy          = η · p · E_pulse · t_e / D
relative to a pulse  = η · t_e / D                (same power p)
GN_HSS / GN          = √(η · t_e / D)             (exposure ∝ GN², from GN = d·N)
```

So the effective guide number falls with the square root of the slit-to-burst duty cycle: shortening `t_e`
by one stop at fixed curtain travel costs about half a stop of guide number. The burst is registered as a
rectangular temporal waveform over `[0, D]` (`createHighSpeedSyncIlluminationOverlay()`), so every line,
including rolling-shutter lines, integrates it over its own window and receives the same energy when `t_e` is
uniform (verified for top, middle and bottom lines). Pulse ripple (the train is treated as continuous, valid
when the pulse period is much shorter than `t_e`), recycle limits beyond `η` and branded protocols are not
modeled. The HSS duty-cycle relation is derived here from the inverse-square guide-number relation; it is an
approximation, not a calibration of any flash unit.

## Highlight-weighted and highlight-priority metering

The 2.0 review asked whether `highlight-weighted` metering underexposes. It does, by construction: it is a
**highlight-emphasis weighted average** placed at the target. Zone weights are
`w0 + (1 − w0)·(signal/max)^γ` and the weighted mean is set to the target, so a small bright area raises the
metered value and the mid-tones go darker. In a frame that is 95 % grey at 0.18 and 5 % at 0.9, uniform
metering reads 0.216; highlight-weighted reads 0.313 with `w0 = 0.2, γ = 2` (the generic tier preset, about
0.54 EV darker) and 0.381 with `w0 = 0.1, γ = 2` (about 0.82 EV darker). This matches its documented
definition, so its id and behaviour are unchanged, but it does **not** place highlights relative to
saturation and gives no headroom guarantee.

`highlight-priority` is the placement mode. It takes the area-weighted `highlightPercentile` quantile `Q_p`
of the zone signals (lower quantile of the weighted empirical distribution, Hyndman & Fan 1996 type 1) and
places it `headroomStops` below a declared relative saturation signal:

```text
placement = saturationRelativeSignal · 2^(−headroomStops)       (the profile target must equal this)
scale     = placement / Q_p
```

In the same frame, `p = 0.99, saturation = 1, headroom = 0.5` meters 0.9 and puts the bright area exactly half
a stop below clipping. ISO 12232's saturation-based speed similarly reserves about half a stop above a
100 % reflector for highlights, a useful reference for choosing the headroom. Because a quantile is not a
linear mean, `highlight-priority` is rejected by the time-averaged scene-radiance meter and by TTL flash.

References (published methods only; nothing copied): ISO 2827, *Photography — Electronic flash equipment —
Determination of exposure guide number*; R. E. Jacobson, S. F. Ray, G. G. Attridge and N. R. Axford, *The
Manual of Photography*, 9th ed., Focal Press, 2000; S. F. Ray, *Applied Photographic Optics*, 3rd ed., Focal
Press, 2002; R. J. Hyndman and Y. Fan, "Sample quantiles in statistical packages", *The American Statistician*
50(4), 1996; ISO 12232:2019 (saturation-based speed).
