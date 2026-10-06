# Dense-pupil qualification — issue #224

## Decision at this checkpoint

The merged repository-only separable-emission prototype is **not qualified for
public promotion or the complete native Focus event**. This checkpoint adds
independent arithmetic oracles and reproducible complete-small-event resource
measurements. It does not close #224, qualify downstream scenes/devices, change
any resource ceiling, or export an experimental function from the package.

The 4-billion spectral-composition ceiling in #225 remains a draft proposal.
Preserving the old arbitrary-provider ceiling while introducing a larger scalar
work ceiling does not meet #224's no-raised-safety-ceiling requirement by itself.
The prototype also has no demonstrated full-native refinement envelope.

## Work and allocation boundaries

For the declared no-PSF source, the original logical support is
`native sites × spatial nodes × temporal nodes × pupil rays × spectral nodes`.
An explicit uniform spectrum and achromatic geometry permit wavelength reuse
only for an identical origin/direction/time request. The geometry upper bound
removes the spectral factor; scalar spectral compositions remain unchanged.
No cross-site, cross-time or cross-event reuse is authorized by that declaration.

| Complete event support | Geometry calls (upper bound) | Scalar spectral compositions |
| --- | ---: | ---: |
| 2048×1366, 4 spatial, 1 temporal, 128 pupil, 2 spectral | 1,432,354,816 | 2,864,709,632 |
| Same support, 256 pupil | 2,864,709,632 | 5,729,419,264 |
| Same 128-pupil support, 2 temporal | 2,864,709,632 | 5,729,419,264 |

The base event is below 2 billion geometry calls but above 2 billion spectral
compositions. Either listed refinement is above both prototype ceilings.
Refinement events retain their own complete support and cannot be divided to
bypass admission. Actual downstream convergence may require other refinements;
these counts do not establish which refinement is scientifically sufficient.

The native output commits seven bytes per site: three uint16 planes and one
uint8 flag plane, or 19,582,976 bytes at 2048×1366. This excludes source profiles,
plans, query/result objects, per-site cache and all runtime overhead. Plans are
bounded by 100,000 logical evaluations per tile; geometric caches by the
single-site support. Object-count bounds are not byte/memory guarantees.

## Independent checks

`test/separable-emission-qualification.test.ts` derives expected photon and
electron counts directly from SI h/c, paraxial `pi/(4*N²)` acceptance, explicit
geometric area, two specified wavelength midpoints, independently evaluated
transmission/QE curves, and the exact integral of a linear time ramp. It uses no
engine reducer or plan to generate the expected answer. It checks 32/64/128 pupil
rays and two/four time nodes for a uniform source and a symmetric origin-dependent
half-pupil edge. This checks normalized weights and response/optical/time ordering
in those constructed cases, not arbitrary 3D depth/occlusion or convergence.

The existing native regressions reuse a shared owned fixture and retain their
original global/native-scan photon and every-code RAW parity, absolute site
identities/seed scheduling, tile/event admission, callback failure, ownership and
cancellation assertions. Legacy parity is an additional implementation comparison,
not an independent oracle for all RAW physics.

## Measured pilot

Run from the repository root after `npm ci`:

```sh
node --expose-gc scripts/qualify-separable-emission.mjs
```

The script compiles source and owned test helpers into a temporary directory,
copies required owned fixtures, executes complete 2×2 events at 32/64/128 pupil
rays for both global and right-to-left native-scan shutters, compares every RAW
code to the reference and records canonical little-endian code hashes. It removes
temporary compilation files on completion/failure. No new dependency is added.

Recorded results: [pilot.jsonl](validation/dense-pupil-2026-10-06/pilot.jsonl).
The evidence identifies base revision and modified source content hashes; it was
measured on Linux x64 / Node 24.19.0. Each event uses four spatial nodes, two
spectral nodes, two temporal nodes and one-site chunks. All four tiles complete,
produce 28 output bytes and yield four times. At 128 pupil rays the events execute
4,096 geometry calls and 8,192 spectral compositions each.

| Pupil rays | Shutter | Complete 2×2 time (ms) | Longest tile interval (ms) | Sampled process RSS peak (MiB) |
| --- | --- | ---: | ---: | ---: |
| 32 | global | 159.23 | 45.08 | 132.0 |
| 32 | native scan | 189.34 | 53.55 | 172.4 |
| 64 | global | 257.49 | 70.51 | 219.2 |
| 64 | native scan | 359.62 | 112.23 | 234.2 |
| 128 | global | 527.75 | 143.34 | 267.1 |
| 128 | native scan | 561.69 | 180.42 | 299.0 |

RSS is the entire process, including retained reference results, compiled helper
execution and heap/allocator history. Sampling can miss transient peaks; these
numbers are neither allocation guarantees nor mobile/browser/device evidence.
One-site chunks do not ensure a responsive host when synchronous planning and
callbacks take this long. No maximum host latency was previously approved here.

Scaling the 128-ray pilots by site count and halving temporal support projects
51.3–54.6 hours at 2048×1366. **This is an extrapolation, not a measured native
runtime or admission guarantee.** Different geometry, allocation, GC, profiles
and device behavior can change it. No complete native event was executed or
independently decoded in this checkpoint. No depth/refinement/source qualification
is established by the matching small-event code hashes.

## Remaining work and decision needed

1. Develop and independently qualify an exact reduction of scalar optical/spectral
   work under explicit supported linearity and source assumptions, preserving all
   committed quadrature measures and operating-range gates. Merely renaming counts
   or increasing the scalar-work ceiling is insufficient.
2. Measure planning/execution/allocation and cancellation/host responsiveness for
   that implementation. Preserve truthful attempted-work counts and fail-closed
   output. Do not infer mobile usability from this contributor host.
3. Demonstrate complete native events with independent photon, packed RAW,
   origin-aware depth/occlusion and refinement evidence within unchanged limits.
4. Separately review a browser-safe public contract and version/API documentation,
   compatibility, package surface and full checks before downstream adoption.
5. Complete substantive human scientific/source review and contribution-specific
   DCO. AI-assisted tests and measurements do not satisfy human review.

Until those steps pass, the experimental route stays under `src/api/`, outside
npm/root exports; #224 and downstream Focus/Depth remain blocked for production.
UI implementation and authenticated staging can continue independently.
