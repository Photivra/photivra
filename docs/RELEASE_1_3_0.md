# Photivra engine 1.3.0 release

This minor release adds evidence-bound radial illumination throughput to bounded environment photo/RAW capture, merged in PR #219. Attenuation is applied exactly once before normalized PSF redistribution; every inverse-PSF tap is validated before provider callbacks. Existing unity-throughput arithmetic and resource limits are preserved. No new dependency, calibration claim, or transport qualification is introduced.

## Compatibility and migration

Existing unity-throughput requests remain supported. Requests using the new non-unity field profile must explicitly request the illumination-vignetting fidelity effect in production composition. Invalid or undeclared attenuation fails before provider callbacks. The photo integration model advances independently to 0.2.0.

Package, lock root, citation and ENGINE_API_VERSION are aligned at 1.3.0. New capture/plan creator identities and hashes may change; archived records retain their original creator identity. Historical fixture bytes and independent model/schema/POC/plan versions are preserved.

## Validation and publication

The owner requested immediate release on October 4, 2026. PR #219 already received owner scientific/source review and passed supported Node CI. This release preparation changes metadata and documentation only. Require static policy, tests/coverage, build, generated references, documentation, isolated packed consumer, package-surface and supported Node CI checks on the final release tree.

After merge and successful main CI, create the unused annotated v1.3.0 tag at the verified main commit. The protected publish workflow rechecks tag/main/version and all distribution gates, verifies the tarball checksum and publishes through npm trusted publishing. Observe successful publication and then create the matching GitHub release. Never move tags or overwrite published versions.
