# Explicit separable ideal emission — draft for issue #224

This repository-only prototype is AI-assisted draft material requiring substantive
human scientific/source review and contributor certification. Its implementation
lives under `src/api/`, the repository-only boundary that is built for contributor
checks but excluded from the npm package and unreachable from the public root API.
The published `src/capture` and `src/sensor` modules are unchanged by this draft.
It includes an experimental native task, not a qualified release or production plan.
No private scene geometry, assets or provider implementation are included.

`calculateSeparableEmissionPhotoSignal` composes the existing bounded single-site
optical/EQE executor with an explicit `uniform-spectrum-achromatic-ideal-emission`
contract. Outgoing spectral radiance is `G(origin, direction, time) × S(wavelength)`.
`G` is a finite nonnegative dimensionless multiplier supplied by caller-owned
ideal-emission geometry. `S` is an explicit, uniform, linear-interpolated spectrum
in W/m²/sr/nm. This declaration excludes wavelength-dependent visibility, surface
spectra and material transport. It does not establish that an external source
actually satisfies those assumptions. Source separability remains unverified.

The geometry callback receives no wavelength or spectral sample identity. All
scene/provider/illumination/material IDs, opening-reference time, outgoing
query direction, pupil origin and ray remain exact. The contract is owned before
callbacks. All original spatial, pupil, temporal and wavelength nodes, normalized
weights, optical throughput, spectral response and photon/EQE calculations execute
unchanged. Only identical geometry requests are reused across wavelengths. No
cross-site/event cache persists. This cache is bounded by the existing 100,000
single-site work cap, and checks cancellation before every spectral composition
and after each caller callback. A synchronous callback cannot be forcibly
interrupted; the host still owns its responsiveness.

The prototype records actual `geometryEvaluationCount` separately from
`spectralCompositionCount`. The existing photo output's `providerEvaluationCount`
continues to mean original logical wavelength/ray evaluations. It must never be
presented as the geometry callback count, or as evidence of calibrated transport.

## Experimental native task and proposed budgets

`createExperimentalNativeSeparableEmissionTask` is a repository-only additive
route. It shares the original native RAW scheduler, noise/ADC executor and photo
observer. The original public task still applies its two-billion provider-event
and 100,000 logical tile limits unchanged. The experimental route separately
requires caller-supplied `maximumGeometryEvaluations` (at most two billion) and
`maximumSpectralCompositions` (draft ceiling four billion). These names are not
interchangeable; the output omits the legacy provider count and records both
actual attempted geometry calls and executed spectral compositions. Failure or
cancellation exposes no partial RAW output. Conservative per-tile geometric
support and complete scalar spectral support are admission-checked before any
geometry callback. The 100,000 logical spectral/ray tile-work cap still applies.
All sites in a tile preflight binding and complete original wavelength coverage
before execution. The host yields at existing RAW tile boundaries; each site's
cache is released before the next site rather than retained for the event.

Full 2048 × 1366 Focus with four spatial nodes, two spectral nodes and 128 pupil
rays has 2,864,709,632 spectral compositions and at most 1,432,354,816 geometry
calls under this exact declaration. A 32-site tile has 32,768 logical spectral
compositions and at most 16,384 geometry calls. The draft four-billion scalar
ceiling is a finite separately named admission bound above that specific event;
it is **not** a measured performance/memory policy or scientific convergence
claim. Callers should declare the tighter exact projected budget, rather than
use the ceiling by default. It adds no nodes, hides no scalar optical/sensor work
and does not widen arbitrary-provider support. A source with wavelength-dependent
visibility or materials remains incompatible. The source owner must establish
this declaration; runtime typing cannot prove an external callback is truthful.

This draft proposes different work domains for a new source model, rather than
raising the existing legacy provider cap. Human review must decide whether this
source assumption and the new spectral budget are appropriate before root API
export, adoption or a full-native fixture qualification run. Current app source
and acquisition queues continue using their recorded legacy/candidate paths.

Tests compare original photon/electron results and every pupil ray at 32/64/128
support using a synthetic origin-dependent occlusion edge. They reject malformed
contract, identity, basis, insufficient spectral coverage, unsupported PSF,
missing pupil, invalid callback factors and cancellation. A wavelength-dependent
visibility negative control deliberately disagrees with this separable source;
it demonstrates why declaration is a scientific requirement rather than proof.
It cannot detect a dishonest or mistaken caller declaration automatically.

Package-boundary acceptance is explicit: `npm pack` must exclude `dist/api/`,
and the browser/root reachability check must not traverse this prototype. Promotion
out of `src/api/` would therefore be a separate reviewed public-contract change.

Still required: independently decoded full-native depth/visibility/refinement,
measured memory/time evidence, a deliberate public API/version decision if this
prototype is ever promoted, and substantive human source/scientific review. No
production admission flag, native fixture qualification or DCO is cleared here.

Native regression tests additionally compare seeded RAW and independently computed
legacy per-site photons/electrons for global and rolling shutters at 32/64/128
pupil support, test separate budgets, unchanged tile/legacy caps, attempted failing
work counts, immutable contract ownership and cancellation at a host yield.
No full native source/event results or physical-device memory evidence are claimed.

## Qualification checkpoint — 2026-10-06

[DENSE_PUPIL_QUALIFICATION.md](DENSE_PUPIL_QUALIFICATION.md) records independent
SI photon/electron checks and complete-small-event resource pilots. It supersedes
any inference that the proposed four-billion scalar ceiling alone resolves #224:
base native spectral work remains above two billion, simple pupil/time refinement
exceeds both prototype ceilings, and no complete native/depth/device event is
qualified. The recorded elapsed-time extrapolation is not native measurement.
The prototype remains repository-only; exact work reduction and full-native
scientific/resource evidence are still required before public promotion.
