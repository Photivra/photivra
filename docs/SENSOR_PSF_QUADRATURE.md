# Local sampled-PSF sensor quadrature

Release context: **package 1.0.0 candidate / root API 0.116.0**. Subsystem/model versions and dated introduction or measurement records below are independent historical identities; they are not distribution versions. See [developer navigation](DEVELOPERS.md) and [release contract](RELEASE_1_0.md).

`calculateSensorPsfIrradianceQuadrature()` applies the existing #113 sampled PSF
resolver to incident spectral irradiance at each pre-AA sensor quadrature point.
It is an explicitly declared **destination-local shift-invariant approximation**,
not a complete field-dependent forward optical transport solver. Production
stages remain gated; provider/projection/visibility execution remains separate.

## Physical domains and coordinates

Inputs are spatial/spectral sensor plans, `psf` resolver settings excluding the
owned field position/wavelength, complete per-node `sourceSamples`, one finite
`timeSecondsFromOpeningReference`, and evidence-backed `spatialModel` and
`psfWavelengthBasis` declarations. `inputMeaning` must be
`pre-psf-pre-sensor-stack-pre-aa-spectral-irradiance`.

At every spatial/wavelength node, the destination is the sensor plan's
`preAntiAliasingSourcePointMm` in **native +X-right/+Y-down** axes. The lens PSF
query uses `{x: destination.x, y: -destination.y}` in **image-plane +Y-up** axes.
Wavelength comes from that exact spectral node. Schema 0.1.0 sampled PSF profiles
lack a wavelength-basis field, so the extra evidence declaration explicitly binds
the source profile's wavelength meaning to the plan's air/vacuum basis. The
adapter neither infers nor converts the basis.

For kernel column `j` and row `k`, the image-plane displacement is
`((j-centerX)*pitchX, (k-centerY)*pitchY)` in micrometres. Inverse sampling in native
sensor millimetres therefore reads:

```text
source.x = destination.x - (j-centerX)*pitchX/1000
source.y = destination.y + (k-centerY)*pitchY/1000
```

Each tap must have exactly that `sourcePointNativeSensorMm`, the same instantaneous
time, unique integer X/Y kernel indices, and finite nonnegative **W/m²/nm**.
All taps, including zero-weight taps, must be supplied. Array order is irrelevant;
results retain canonical wavelength/spatial/kernel order and owned source copies.
No off-sensor support is clamped, mirrored, repeated or dropped. Missing support
fails; it never triggers renormalization or a smaller blur kernel.

## Weighting and downstream handoff

The output at one node is `sum(kernel.normalizedIntensity[i] * E_lambda(source_i))`.
The #113 resolver owns kernel interpolation/normalization and its finite-support
meaning. These weights are discrete unit-energy shape weights, not irradiance
density, area, optical transmission, QE or shutter measures. Do not multiply them
by kernel cell area a second time.

`relativePupilThroughputFactor` is retained in each resolved PSF child envelope
and is **not applied** by this adapter. The upstream optical-throughput path must
own it exactly once. Likewise, do not independently add diffraction/defocus/other
effects already included by `responseIncludes`, or pass already blurred input
under a pre-PSF declaration. Declarations do not establish upstream execution.

The existing irradiance reducer applies sensor aperture/AA/spectral measures
once to the resulting pre-AA samples. Its returned `reduction` is diagnostic;
when handing `irradianceSamples` to `calculateSensorEqeTemporalExposure()`, use
the samples directly without multiplying the diagnostic reduction again. Compute
this PSF adapter separately at each exact local shutter midpoint; the downstream
sensor adapter validates response and operating range before integrating EQE
rates. Existing compact temporal photo/dark/charge/RAW/file contracts stay intact.

## Explicit limits

`psfRedistributionApplied` is true only for this named local approximation.
`localShiftInvarianceEstablished`, `globalFieldEnergyConservationEstablished`
and `sceneProviderExecutionVerified` remain false. A kernel resolved at the
destination is not equivalent to spatially varying forward transport
`E_out(q)=integral E_in(s)*h_s(q-s) ds`; depth/visibility changes within its support
also require a richer solver. The supplied limitation/evidence remains visible.
No calibrated photographic accuracy, combined uncertainty, infinite-tail
convergence or production capability is asserted.

The aggregate spatial × spectral × kernel input budget is 100,000 source nodes,
checked before per-node PSF resolution. Existing PSF profile and sensor plan
validity/coverage gates remain unchanged. Approximation output retains all child
PSF evidence/uncertainty and explicit basis/spatial-model declarations.

Tests use owned synthetic profiles: uniform light preserves irradiance independent
of pupil throughput; an asymmetric affine field independently predicts inverse
X/Y offsets; distinct wavelength shapes remain distinct; temporal sensor handoff
matches SI photon/EQE expectations. Missing/duplicate/sparse/negative support,
coordinate/time/basis/stage/model/evidence drift and work overflow reject.

Root API **0.111.0 → 0.112.0**, model 0.1.0. No existing public contract is
reinterpreted; package/POC/production/RAW/noise versions are unchanged. Historical
capture/file replay keeps its stored API stamp. No dependency, third-party asset,
network access or cost is introduced. At this introduction checkpoint, #16/#178/#112 were open and V1 was 25/32. They are now reviewed/merged; final conformance is complete.
