# Generic tier preset acceptance disposition

This is the final proposed #116 asset/catalog disposition against engine API
0.116.0 and production plan 0.7.0. The reviewed/merged release gate still applies.
#119 owns broader calibration and acceptance fixtures; #131 owns final conformance.
This document does not certify calibrated performance or silently approve a V1
science deferral.

## #116 acceptance evidence

| Criterion | Implementation and evidence |
| --- | --- |
| Generic bodies/lenses; exactly three stable names | `generic-tier-assets.ts`; complete SHA-256 manifest fixture; labels Consumer, Prosumer, Professional |
| Form, focal range and sensor format independent of tier | Explicit 50 mm prime assets; caller-owned geometry; selection flags; finite-state rejection tests |
| Matching defaults and cross-tier compatibility | Exact-version selection and #109 capability resolution; all nine pairings through executed production and output |
| Body/lens labels never enter scientific equations | Explicit resolved ISO/readout/transmission/pupil/correction profiles; independent photon transmission-ratio test and body-invariant photo expectation |
| Bokeh from explicit profiles | All 27 finite pupil slices independently checked by direct phase summation and evaluated on the same controlled texture/highlight scene |
| Matched optical conditions | #130 focal length, f/4, focus, exposure and seed reused; field/defocus variants remain explicit and do not modify the canonical fixture |
| No universal Professional ranking | Existing Prosumer/Professional falloff and gain-noise tradeoff; near/far and field responses remain multidimensional |
| Deterministic versioned definitions | Assets 1.0.0 and selection 0.1.0 unchanged; full manifest hash, immutable results, saved-profile drift rejection and replay tests |
| Exact saved references | Strict parser pins every body/lens/science reference; unknown versions and aliases reject without fallback |
| Physical/corrected outcomes distinct | Existing residual/CA/crop/Jacobian/interpolation/gain tests plus finite pupil scene correction Off/On using the same sampled capture/noise identity |
| Applicable body/output execution | Existing AF/drive/meter/AWB/stabilization/readout tests and new nine-pair authoritative scene→RAW→processed-output→paired-file tests |

## Ownership and limits

#116 defines and demonstrates the supported generic preset assets. No new optical
family, calibration dataset or tier-specific scientific engine is required for its
catalog acceptance. The existing foundations own their ordinary validity envelopes.
A lens with f/4–f/16 exposure capability has optical reference data only at f/4; the
resolver rejects unsupported optical acquisition states rather than extrapolating.

The new production fixture is a narrow-band ideal environment with independently
owned synthetic sensor registration/response/capacity/color declarations. It uses
exact tier readout profiles and transmission values via an explicitly identified
capability-binding fixture bridge. Its coarse 2×2 raster proves binding/lineage and
execution, not normal camera resolution or physical pixel pitch. Provider transport,
visibility, sensor calibration and absolute color accuracy remain unverified.

Exact complex pupils exist only at 550 nm, three field points and signed defocus
−20/0/+20 µm. Their controlled sampled-scene tests use those exact slices. Production
cannot silently interpolate them over spectrum/field/defocus, so its separate
continuous-spectrum test explicitly omits PSF. Pupil throughput and illumination
falloff retain separate ownership. No simultaneous composition is asserted.

#119 now has its final proposed matched report/envelope and stabilization/flash
acceptance disposition in [TIER_ACCEPTANCE.md](TIER_ACCEPTANCE.md), pending review
and merge. LoCA/spectral bokeh, measured MTF,
manufacturer AF performance, arbitrary lens-state optical interpolation and external
calibration are outside these initial assets' implemented representation; none is
invented by catalog labels. Unsupported required effects continue to block under
the authoritative production contract. #43/#45 remeasure the final consumers;
#131 reviews final scientific conformance; #180 performs the final documentation
and release audit.

All new scene data and phase-sum calculations are Photivra-owned synthetic test
material; no third-party calibration, brand profiles, dependencies or license changes.
Root API 0.116.0, preset 1.0.0, selection 0.1.0 and all other versions are unchanged.
