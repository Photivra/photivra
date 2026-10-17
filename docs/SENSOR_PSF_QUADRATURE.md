# Local sampled-PSF sensor quadrature

> **Release context.** This page was written for package 1.2.0 (root API 1.2.0) and has not been re-reviewed for later releases. The [changelog](../CHANGELOG.md) describes the current release. Model and subsystem version numbers on this page, and any dated records, are separate from the package version. See also the [developer guide](DEVELOPERS.md) and the [1.2.0 release contract](RELEASE_1_2_0.md).

`calculateSensorPsfIrradianceQuadrature()` blurs incoming light with the lens PSF (point-spread function) before it reaches the sensor. It applies the existing [sampled PSF resolver](PSF_FOUNDATION.md#sampled-real-lens-psfs) to incident spectral irradiance, at each sensor quadrature point before anti-aliasing (AA).

It is an explicitly declared **approximation**: at each destination point, it uses the PSF for that point, as if the blur did not change nearby (destination-local shift invariance). It is not a complete forward optical transport solver that varies across the field. Production stages stay gated, and execution of the provider, projection and visibility is separate.

## Physical domains and coordinates

**Inputs.**

- the spatial and spectral sensor plans;
- `psf` resolver settings, except the field position and wavelength, which this function owns;
- complete `sourceSamples` for every node;
- one finite `timeSecondsFromOpeningReference`;
- evidence-backed `spatialModel` and `psfWavelengthBasis` declarations.

`inputMeaning` must be `pre-psf-pre-sensor-stack-pre-aa-spectral-irradiance`.

**Coordinates.** At each spatial and wavelength node:

- The destination is the sensor plan's `preAntiAliasingSourcePointMm`, in **native axes: +X right, +Y down**.
- The lens PSF is queried at `{x: destination.x, y: -destination.y}`, in **image-plane axes, +Y up**.
- The wavelength comes from that exact spectral node.

**Wavelength basis.** Schema 0.1.0 sampled PSF profiles have no wavelength-basis field. So the extra evidence declaration explicitly ties the profile's wavelength meaning to the plan's air or vacuum basis. The function neither infers nor converts the basis.

**Where each tap reads from.** For kernel column `j` and row `k`, the image-plane displacement in micrometres is `((j-centerX)*pitchX, (k-centerY)*pitchY)`. Reading backwards, in native sensor millimetres, gives:

```text
source.x = destination.x - (j-centerX)*pitchX/1000
source.y = destination.y + (k-centerY)*pitchY/1000
```

**Tap rules.**

- Each tap must have exactly that `sourcePointNativeSensorMm`, the same instant in time, unique integer X/Y kernel indices, and a finite nonnegative value in **W/m²/nm**.
- Every tap must be supplied, including taps with zero weight.
- Array order does not matter. Results keep a canonical wavelength / spatial / kernel order, and owned copies of the sources.
- Support outside the sensor is never clamped, mirrored, repeated or dropped. Missing support fails; it never triggers renormalisation or a smaller blur kernel.

## Weighting and downstream handoff

**The sum.** The output at one node is `sum(kernel.normalizedIntensity[i] * E_lambda(source_i))`.

- The PSF resolver owns kernel interpolation, normalisation and what its finite support means.
- The weights are discrete shape weights that sum to one. They are not irradiance density, area, optical transmission, QE or shutter measures.
- Do not multiply them by the kernel cell area a second time.

**Throughput is not applied here.** `relativePupilThroughputFactor` is kept in each resolved PSF child record, and is **not applied** by this function. The upstream optical-throughput path must apply it exactly once.

Likewise, do not separately add diffraction, defocus or other effects that `responseIncludes` already covers. Do not pass input that is already blurred under a "pre-PSF" declaration. Declarations do not prove that upstream steps ran.

**Passing results on.**

- The existing irradiance reducer applies the sensor aperture, AA and spectral measures once, to the resulting pre-AA samples. Its returned `reduction` is diagnostic.
- When passing `irradianceSamples` to `calculateSensorEqeTemporalExposure()`, use the samples directly. Do not apply the diagnostic reduction again.
- Run this PSF function separately at each exact local shutter midpoint. The downstream sensor function checks response and operating range before integrating EQE (external quantum efficiency) rates.
- The existing compact temporal photo, dark-charge, charge, RAW and file contracts are unchanged.

## Explicit limits

**Flags.**

- `psfRedistributionApplied` is true, for this named local approximation only.
- `localShiftInvarianceEstablished`, `globalFieldEnergyConservationEstablished` and `sceneProviderExecutionVerified` stay false.

**Why this is an approximation.** Using the kernel resolved at the destination is not the same as spatially varying forward transport, `E_out(q)=integral E_in(s)*h_s(q-s) ds`. Changes in depth or visibility within the kernel's support also need a richer solver. The supplied limitation and evidence stay visible. No calibrated photographic accuracy, combined uncertainty, convergence of the infinite tails or production capability is claimed.

**Limits.** The total spatial × spectral × kernel input is limited to 100,000 source nodes, checked before any per-node PSF resolution. Existing checks on PSF profile and sensor plan validity and coverage are unchanged. The approximation output keeps all child PSF evidence and uncertainty, and the explicit basis and spatial-model declarations.

## Tests and versions

The tests use synthetic profiles owned by Photivra:

- uniform light keeps its irradiance, whatever the pupil throughput;
- an asymmetric affine field independently predicts the inverse X/Y offsets;
- different wavelength shapes stay different;
- the temporal sensor handoff matches SI photon and EQE expectations.

These are rejected: missing, duplicate, sparse or negative support; drift in coordinates, time, basis, stage, model or evidence; and too much work.

**Versions.** Root API **0.111.0 → 0.112.0**, model 0.1.0. No existing public contract is reinterpreted. Package, POC, production, RAW and noise versions did not change. Replay of historical captures and files keeps its stored API stamp. No dependency, third-party asset, network access or cost is added.
