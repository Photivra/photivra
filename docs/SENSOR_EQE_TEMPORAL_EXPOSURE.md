# Nonstationary EQE exposure quadrature

Release context: **package 1.2.0 candidate / root API 1.2.0**. Subsystem/model versions and dated introduction or measurement records below are independent historical identities; they are not distribution versions. See [developer navigation](DEVELOPERS.md) and [release contract](RELEASE_1_2_0.md).

`calculateSensorEqeTemporalExposure()` evaluates physical spectral irradiance at
explicit local shutter midpoints, validates sensor response at every instant,
and accumulates expected photons and photoelectrons. It reuses the instantaneous
spatial/spectral reduction, applicability, operating-range, EQE and local binding
steps used by `calculateSensorEqeLocalExposure()`. The stationary adapter's
arithmetic, evidence and return shape remain unchanged.

The shared input is the stationary adapter's input without `irradianceSamples`
or `stationarityProfile`. Instead, `samples` holds `temporalSampleIndex`,
`timeSecondsFromOpeningReference` and complete `irradianceSamples` for each time.
All instants use the same site, profiles, native registration and shutter event.
No stationarity profile is required or fabricated. Providers supply actual
instant-specific values; this API does not execute a renderer or motion model.

For local start `a`, duration `D` and `n` samples, temporal index `i` must have
exact time `a + (i + 0.5) * (D / n)`. Times use the authoritative shutter's
`first-opening-boundary-phase` reference, including rolling offsets. Callers
must use this same arithmetic; a different/global clock or stale window fails.
Times must be representable, interior and strictly increasing. Each node has
integration measure `D/n` seconds and separate dimensionless average weight
`1/n`. Only the seconds-valued measure multiplies the instantaneous rate.

Expected counts are compensated sums of `photonRate_i * D/n` and
`electronRate_i * D/n`. Counts retain fractional expectations. Spatial area,
wavelength measure, response and temporal duration each apply once. Response
operating validity is checked independently at every time; valid average
irradiance cannot hide an invalid bright instant. AA/source support, response
plane, per-bin validity and photon-energy basis retain the existing fail-closed
rules. Child envelopes retain uncombined uncertainty and evidence.

Coverage is complete and index-based; shuffled declarations produce identical
canonical output. Missing, duplicate, sparse, out-of-range or mistimed samples
reject. Execution allows 1–256 temporal samples and at most 100,000 supplied
spatial × spectral × temporal irradiance nodes across the entire request.
These are reference safety limits, not production-resolution performance claims.

## Result boundary

The distinct kind `eqe-temporal-quadrature-expected-counts` reports integrated
photo expectations with `timeStationarityEstablished: false` and
`timeVaryingSignalIntegrated: true`. It is **not** the existing stationary
`SensorEqeExposureIntegration`. Dark/charge/RAW consumers reject this full diagnostic record;
do not cast it, synthesize stationarity fields or relabel its kind. The explicit
[temporal photo-signal handoff](TEMPORAL_PHOTO_RAW.md), added at root API 0.110.0,
recomputes physical input and produces a distinct validated compact record.
Dark current, completeness, physical capacity, noise, readout and RAW remain
separate responsibilities. Production gates are unchanged.

The field samples remain declarations. This calculation does not establish
scene projection/visibility/PSF/transport, calibrated source truth, scene
stationarity, detector bandwidth, quadrature convergence or propagated
uncertainty. Shared response state assumes the existing instantaneous EQE model
is applicable at each time; it does not model temporal response lag or hysteresis.
Uniform midpoint sampling can miss short pulses or discontinuities; increase
resolution and measure convergence against the actual quantity, or use a future
explicit breakpoint/pulse model. No error bound is inferred from sample count.

Tests use owned synthetic fields and independent SI photon-energy/area/response
arithmetic. Constant fields match stationary counts; a quadratic field shows
expected midpoint convergence; rolling offsets and single-instant operating
range failure are verified. These are mathematical regression evidence, not
photographic calibration. Separate [handoff acceptance](https://github.com/Photivra/photivra/blob/main/test/temporal-photo-raw.test.ts)
now covers nonstationary RAW/export from owned synthetic inputs.

This additive API advances root API 0.108.0 to **0.109.0**, with model 0.1.0.
Package, POC, production, capture/RAW schemas and noise identities are unchanged.
Historical replay retains its stored root stamp and pinned paired-file hashes;
new capture identities may include the new API stamp. No dependency or cost is
introduced. Remaining #16/#178/#112 work includes source execution, PSF,
production activation and editor/resolution acceptance; this slice closes no umbrella ticket.
