# Irradiance to stationary EQE local exposure

`calculateSensorEqeLocalExposure()` is a bounded sensor-layer composition. It
accepts explicit physical spectral irradiance samples in **W/m²/nm**, not RGB,
and returns a photoelectron expectation suitable for the existing accumulated
charge and RAW producer. It does not establish scene/optics origin, execute a
renderer, or activate reserved production stages.

## Input ownership and order

The caller supplies `colorSamplingProfile`, `spectralResponseProfile`,
`spatialSampling`, `spectralSampling`, `irradianceSamples`,
`responseApplication`, `operatingRangeProfile`, `localExposure`, and
`stationarityProfile`. Optional `airPhotonEnergyContext` retains the EQE API's
explicit air-to-vacuum photon-energy requirements; vacuum wavelengths need none.

The adapter delegates in this order:

1. Spatial midpoint/AA quadrature uses the supplied local timing's native raster
   and binding profile, plus the explicit physical imaging area/aperture/lattice.
2. Spectral midpoint quadrature checks response support and requested wavelength
   measure. The caller must separately establish scene/optics spectral coverage.
3. Reduction requires one identified irradiance value for every Cartesian node.
   Ordering is irrelevant; missing, duplicate, nonfinite or negative inputs fail.
   Values are evaluated at each node's `preAntiAliasingSourcePointMm` before AA
   and sensor response. Spatial units and wavelength measure apply once.
4. Application compatibility establishes response plane/scope, collection area,
   uniform spatial response and reference conditions. Operating range checks the
   specified radiant-power domain and spectral/spatial linearity evidence.
5. EQE converts radiant power to photons and expected electrons. Responsivity
   profiles are rejected by this EQE path. A channel filter is applied only when
   the existing separable-response contract requires it.
6. Local shutter binding validates the site/channel and computes its exact
   one-to-one native exposure window. The stationarity profile must match that
   site, binding and window before rate × duration integration.

Prepare sample identities with the existing public spatial/spectral quadrature
functions and the same parameters. This composition recomputes those plans;
caller-supplied result flags do not bypass these calculations or validity gates.
The input is not frozen or mutated. Child results retain separate provenance,
evidence and declared response uncertainty; no uncertainty combination or
quadrature-convergence estimate is introduced.

## Downstream handoff

```ts
const photo = calculateSensorEqeLocalExposure(request);
const charge = {
  photoSignal: photo.value.exposure.value,
  darkCharge,
  completenessProfile
};
// Feed charge with explicit sampling/capacity/readout state into
// simulateSensorRawFrame(). Paired export consumes that returned RAW frame.
```

Dark charge, other stored charge, completeness, capacity, stochastic realization
and electronics are still separate downstream responsibilities. Do not insert
fake zero-dark or completeness evidence to obtain RAW. A rolling schedule in the
RAW producer must match the local event used here. Nonstationary scene motion or
irradiance requires actual temporal integration, which this adapter does not
implement; a stationarity declaration is not such integration.

The result declares `upstreamOrigin: "declared-spatio-spectral-irradiance-samples"`
and `upstreamSceneAndOpticsVerified: false`. It retains spatial/spectral plans,
reduction, compatibility, operating range, electron rate, exposure binding and
exposure **envelopes**. Aggregate provenance is approximation. The RAW producer
and attachment/export origin flags stay conservative: executing this adapter
cannot prove the irradiance provider's history or calibration.

## Evidence and compatibility

`test/eqe-local-exposure.test.ts` independently predicts photon/electron counts
using SI Planck/light-speed constants, µm²-to-m² conversion, two spectral
midpoints and the synthetic QE curve. It checks order independence, exact rolling
windows and duration scaling, invalid node/plane/range/channel/binding/window
inputs, and all four native Bayer sites through deterministic RAW and paired
DNG/JPEG. Fixtures are owned synthetic test declarations, not measured camera
calibration or scene validation. Existing primitive tests remain in place.

This additive entry point advances root API **0.106.0 → 0.107.0**. The composition
model is 0.1.0; package, POC, production-plan, capture/RAW/producer schemas and
noise identities remain unchanged. Newly created captures carry the new root
API stamp, so their provenance-dependent export identities may differ. Historical
capture replay preserves its stored root stamp and pinned paired-file hashes;
no primitive equations, stochastic seeds or RAW readout arithmetic change.

Remaining #16/#178/#112 work includes committed scene/optics/PSF-to-node origin,
nonstationary temporal integration, production-stage activation and broader
resolution/editor acceptance. This handoff does not close those tickets.
