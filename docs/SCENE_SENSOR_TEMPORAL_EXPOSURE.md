# Declared temporal scene radiance to sensor EQE

> **Release context.** This page was written for package 1.2.0 (root API 1.2.0) and has not been re-reviewed for later releases. The [changelog](../CHANGELOG.md) describes the current release. Model and subsystem version numbers on this page, and any dated records, are separate from the package version. See also the [developer guide](DEVELOPERS.md) and the [1.2.0 release contract](RELEASE_1_2_0.md).

This page covers how scene light that changes during an exposure is turned into a sensor signal, and the flash and metering models that build on it.

`calculateSceneSensorEqeTemporalExposure()` combines two existing calculations: the scene-to-sensor optical quadrature, and the temporal EQE (external quantum efficiency) calculation. At **every local shutter midpoint** it evaluates optics, response compatibility, the operating range for each spectral bin, and EQE. Only then does it integrate the rates, using time measures in seconds.

It never averages the light first. Averaging first could hide an instant that was too bright to be valid.

## Input and binding

**Sensor.** `sensor` is a `CalculateSensorEqeTemporalExposureInput` without `samples`. Its aperture/anti-aliasing, CFA/site/native registration and spectral-response inputs define both quadrature plans. There is no separate optical plan from the caller that could drift away from the sensor plan.

**Scene and optics.** `sceneBindings` and `optics` keep the static optical bridge's validation of provider, material, illumination, working f-number, transmission, filters and field throughput.

**Time.** `timeReference` must be explicitly `first-opening-boundary-phase`. Each temporal sample has:

- `temporalSampleIndex`;
- `timeSecondsFromOpeningReference`;
- complete `sceneSamples`, in the existing optical quadrature shape.

Every scene request's timestamp must equal this local midpoint, on the same declared reference. This composition explicitly ties scene query times to that opening edge. Readout time or renderer frame time is never used instead. The temporal sensor calculator checks the exact midpoint against the resolved local shutter window, including rolling offsets, with its existing checks that the time can be represented exactly.

**Counts and identity.**

- Indices must cover 1–256 temporal samples, each exactly once. Array order is not identity.
- The shared temporal check runs before any optical calculation. It enforces a total budget of 100,000 declared spatial × spectral × temporal nodes.
- The existing optical binder separately checks that the full spatial × spectral grid is covered exactly.
- Scene `sampleId` values must be unique across all instants, as well as within one instant. Reusing an earlier query identity for a new time is rejected.

**Light plane.** The optics output is still **W/m²/nm incident on the sensor package, before the optical stack and before anti-aliasing**. The response application must declare that plane explicitly, and the selected effective response must support it. This API cannot relabel light as incident on the site, or quietly add stack attenuation that package-effective EQE already includes.

## Output and downstream handoff

The result record (labelled approximation) keeps:

- canonical `opticalSamples`, with the detailed optical and provider binding evidence;
- an `exposure` record for temporal EQE, with independent sensor evidence for each instant.

The detailed diagnostic reductions are not extra signal. Do not add them, or apply their measures twice.

To commit a compact RAW photo signal, pass the retained irradiance samples to the existing creator. It revalidates the temporal physical input independently:

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

Use `photo.value.photoSignal` together with:

- dark charge calculated separately for exactly the same event;
- evidence for charge completeness and capacity;
- the existing RAW, noise and readout inputs.

Revalidation is not a second exposure; use only one photo signal. The paired exporter still derives the JPEG from the exact attached native RAW.

## Limits and compatibility

- Provider results, targets and visibility are still declared approximations. Here the engine does not call a renderer, intersect scene geometry or redistribute PSF energy.
- `sourceTargetProjectionVerified`, `sceneProviderExecutionVerified` and `psfRedistributionApplied` stay false.
- Nothing is inferred about calibration, combined uncertainty, convergence bounds, physical accuracy, acceptance at full resolution or by editors, or activation of production stages.
- Requested capabilities that are missing still block in the production graph.

When introduced, related export and processing work was still open; it has since been completed for its bounded scope.

This public addition moved the root API from **0.110.0 to 0.111.0**, with model 0.1.0. Package, POC, production, capture/RAW and noise/readout versions did not change. Existing temporal validation diagnostics and arithmetic, and replay of historical files, are unchanged. New capture commitments carry the new root API stamp. Tests use synthetic evidence owned by Photivra, not third-party calibration. No new dependency, asset, network operation or cost is introduced.

## Flash: guide number, TTL and high-speed sync

All three models below are approximations, in the relative units the engine already uses. They do not reproduce any vendor's TTL algorithm, zone-weighting table, pulse curve or flash protocol.

Flash (TTL) metering is kept separate from ambient metering. The ambient meter result is an input, and is never changed.

### Guide number

The guide number (GN) tells you how far a flash reaches at a given aperture:

```text
GN = d · N                       (correct flash exposure at distance d and f-number N)
GN(p, ISO) = GN_full · √p · √(ISO/100)
p(d) = (d · N / (GN_full · √(ISO/100)))²,  clamped to [p_min, 1]
```

**Derivation.** Treat the flash as a point source that emits a luminous energy per unit solid angle Q (lumen-seconds per steradian, i.e. luminous intensity integrated over the flash pulse). Q is proportional to the power fraction `p`: Q = p·Q_full.

1. *Inverse-square law.* At distance d the subject receives a luminous exposure (illuminance integrated over the pulse) of Q/d² lx·s.
2. *Camera equation.* A diffuse subject of reflectance ρ then has a time-integrated luminance ρ·Q/(π·d²), and the focal-plane exposure is H = 0.65·ρ·Q/(π·d²·N²) (CIPA DC-004-2020 §5.5 (4), free, with L·t replaced by the time-integrated luminance).
3. *Correct exposure.* The exposure is correct when H equals the reference exposure for the ISO setting S. With the DC-004 standard output sensitivity, H = 10/S (§3.2). So d²·N² = 0.65·ρ·Q·S/(10·π).
4. *Guide number.* The right-hand side does not depend on d or N, so for a given flash, power and ISO the product d·N is a constant. That constant is the guide number: GN = d·N = √(0.65·ρ·Q·S/(10·π)).
5. *Power scaling.* GN ∝ √Q ∝ √p, so GN(p) = GN_full·√p.
6. *ISO scaling.* GN ∝ √S. Quoted relative to ISO 100, GN(S) = GN_100·√(S/100).
7. *Power for a distance.* Solving d·N = GN_full·√p·√(ISO/100) for p gives the formula above.

The engine does not model how a guide number is measured (the reflectance, metering and calibration conventions that fix the constant in step 4). The caller supplies GN_full, and the engine uses only the d, N, √p and √(ISO/100) relations derived here.

**Source.** CIPA DC-004-Translation-2020, *Sensitivity of Digital Cameras*, free at <https://www.cipa.jp/e/std/std-sec.html> (S = 10/H and H = 0.65·L·t/N²). The inverse-square law for a point source is elementary photometry. Jacobson et al., *The Manual of Photography*, and Ray, *Applied Photographic Optics*, give the same relation.

**Free sources.** No free source was found that states GN = d·N directly. Both of its parts are freely sourced: the inverse-square law for the illuminance from a lamp ([NIST SP 250-37](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication250-37.pdf)) and the camera equation, image irradiance ∝ L/(f/#)² (Greivenkamp, [OPTI-502 course notes, sec. 11](https://wp.optics.arizona.edu/jgreivenkamp/wp-content/uploads/sites/11/2019/08/502-11-Radiative-Transfer.pdf)). The two books above are kept as "also see".

**Functions.** `calculateFlashGuideNumber()` and `calculateFlashPowerForDistance()` implement it. The second also reports whether the power was clamped, the error in stops (delivered minus required), and the full-power range `GN/N`.

### TTL with a pre-flash

TTL (through-the-lens) flash fires a small pre-flash, measures the result, and then sets the main flash power. `resolveTtlFlashExposure()` (`preflash-linear-ttl` 1.0.0) takes two measurements of the same zones with the existing relative meter: ambient only, and ambient plus a pre-flash at a known power fraction `p_pre`.

```text
f_i  = pre_i − ambient_i                  flash-only signal per zone (must be ≥ 0)
A    = M(ambient),  F = M(f) / p_pre      M = the profile's metering policy (linear policies only)
k    = ambient integration in the main exposure / in the measurement window (same aperture and ISO)
T'   = target · 2^FEC
p    = (T' − k·A) / (F · s),  clamped to [p_min, 1];  s = 1 (front/rear curtain) or η·t_e/D (HSS)
```

(FEC is flash exposure compensation.)

**Which meters work.** Uniform, centre-weighted and spot metering are linear in the zone signals, so the metered total of the main exposure is exactly `k·A + p·F·s`. Highlight policies are rejected, because their weights depend on the signal.

**Results.** The result reports one of:

- `resolved`;
- `clamped-at-minimum-power` (ambient light alone may already reach the target);
- `clamped-at-full-power`, with the predicted exposure error;
- `no-flash-return`.

It also reports the effective guide number and flash range when a guide number is supplied.

The pre-flash happens before the main exposure, so any movement or ambient change between them is outside the model.

**Applying the power.** `createTtlScaledFlashProfile()` scales a `ManualFlashProfile` by the solved power. The scaled profile is then placed by the existing `resolveManualFlashSync()`, exactly as before. Front- and rear-curtain sync differ only in where the same pulse sits inside the interval when the whole frame is open, so TTL power and sync timing stay independent. For HSS, pass the unscaled profile and the TTL power fraction to `resolveHighSpeedFlashSync()`.

### High-speed sync

**The problem.** When the opening and closing edges cross the frame faster than the exposure time, no instant exposes the whole frame at once. A single pulse would light only a band, so ordinary sync still fails closed (is rejected).

**The solution.** High-speed (focal-plane) sync (HSS) emits a rapid train of pulses that behaves like constant output over the whole travelling-slit exposure. `resolveHighSpeedFlashSync()` (`flash-hss-quasi-continuous-burst` 1.0.0) requires a schema 0.2.0 sync-capability profile that declares HSS and the burst energy fraction `η`. This is the energy of a full-power burst relative to one full-power ordinary pulse, taken from evidence; it absorbs capacitor and thermal limits.

**Derivation.** Let `E_pulse = ∫ pulse(t) dt` be the energy of a full-power ordinary pulse (relative units), and `D = T + τ_close` the burst duration, from the first line opening to the last line closing. At power `p`, the burst carries `E_burst = η·p·E_pulse` at constant output `P = E_burst / D`. A line whose slit is open for `t_e` collects `P·t_e`:

```text
line energy          = η · p · E_pulse · t_e / D
relative to a pulse  = η · t_e / D                (same power p)
GN_HSS / GN          = √(η · t_e / D)             (exposure ∝ GN², from GN = d·N)
```

So the effective guide number falls with the square root of the slit-to-burst duty cycle. Shortening `t_e` by one stop, at fixed curtain travel, costs about half a stop of guide number.

**Even exposure across the frame.** The burst is registered as a rectangular waveform over `[0, D]` (`createHighSpeedSyncIlluminationOverlay()`). Every line, including rolling-shutter lines, integrates it over its own window, and gets the same energy when `t_e` is the same for all lines (verified for top, middle and bottom lines).

**Not modelled.**

- Pulse ripple. The train is treated as continuous, which is valid when the pulse period is much shorter than `t_e`.
- Recycle limits beyond `η`.
- Brand-specific protocols.

The HSS duty-cycle relation is derived here from the inverse-square guide-number relation. It is an approximation, not a calibration of any flash unit.

## Highlight-weighted and highlight-priority metering

**Highlight-weighted metering underexposes, by design.** The 2.0 review asked whether `highlight-weighted` metering underexposes. It does. It is a **weighted average that emphasises highlights**, placed at the target.

- Zone weights are `w0 + (1 − w0)·(signal/max)^γ`, and the weighted mean is set to the target.
- So a small bright area raises the metered value, and the mid-tones come out darker.
- Example: a frame that is 95 % grey at 0.18 and 5 % at 0.9. Uniform metering reads 0.216. Highlight-weighted reads 0.313 with `w0 = 0.2, γ = 2` (the generic tier preset; about 0.54 EV darker), and 0.381 with `w0 = 0.1, γ = 2` (about 0.82 EV darker).

This matches its documented definition, so its id and behaviour are unchanged. But it does **not** place highlights relative to saturation, and gives no guarantee of headroom.

**Highlight-priority metering places highlights.** `highlight-priority` takes the `highlightPercentile` quantile `Q_p` of the zone signals, weighted by area. It uses the lower quantile of the weighted empirical distribution (Hyndman & Fan 1996, type 1). It then places that value `headroomStops` below a declared relative saturation signal:

```text
placement = saturationRelativeSignal · 2^(−headroomStops)       (the profile target must equal this)
scale     = placement / Q_p
```

In the same frame, `p = 0.99, saturation = 1, headroom = 0.5` meters 0.9, and puts the bright area exactly half a stop below clipping. The half-stop headroom of the generic tier preset is the engine's own documented choice, not a value taken from a standard. CIPA DC-004 (free) defines only the mid-grey reference level of standard output sensitivity (an 18 % grey at S = 10/H) and says nothing about highlight headroom.

Because a quantile is not a linear average, `highlight-priority` is rejected by the time-averaged scene-radiance meter and by TTL flash.

**References** (published methods only; nothing copied):

- Y. Ohno, *NIST Measurement Services: Photometric Calibrations*, NIST SP 250-37, 1997, free at <https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication250-37.pdf> (inverse-square law).
- J. E. Greivenkamp, *OPTI-502 Optical Design and Instrumentation I*, sec. 11, University of Arizona, 2019, free at <https://wp.optics.arizona.edu/jgreivenkamp/wp-content/uploads/sites/11/2019/08/502-11-Radiative-Transfer.pdf> (camera equation).
- Also see: R. E. Jacobson, S. F. Ray, G. G. Attridge and N. R. Axford, *The Manual of Photography*, 9th ed., Focal Press, 2000.
- Also see: S. F. Ray, *Applied Photographic Optics*, 3rd ed., Focal Press, 2002.
- R. J. Hyndman and Y. Fan, "Sample quantiles in statistical packages", *The American Statistician* 50(4), 1996.
- CIPA DC-004-Translation-2020, *Sensitivity of Digital Cameras*, free at <https://www.cipa.jp/e/std/std-sec.html> (S = 10/H, §3.2; H = 0.65·L·t/N², §5.5; 18 % grey reference level, Explanation 1 and 2.2).
