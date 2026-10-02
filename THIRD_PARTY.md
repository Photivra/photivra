# Third-party inventory

The published/runtime root package currently declares **no runtime npm dependencies**.

This file records direct development and CI dependencies intentionally used by the repository. Versions match `package.json`; GitHub Actions are additionally pinned to immutable commit SHAs in CI.

| Component | Version / revision | Purpose | License |
| --- | --- | --- | --- |
| TypeScript | 6.0.3 | Type checking/compiler | Apache-2.0 |
| @types/node | 24.13.6 | Node API type definitions | MIT |
| ESLint | 10.10.0 | Linting | MIT |
| @eslint/js | 10.0.1 | ESLint JavaScript configuration | MIT |
| typescript-eslint | 8.70.0 | TypeScript ESLint integration | MIT |
| Vitest | 5.0.1 | Unit/integration testing | MIT |
| @vitest/coverage-v8 | 5.0.1 | V8-backed test coverage | MIT |
| actions/checkout | v7 / `3d3c42e5aac5ba805825da76410c181273ba90b1` | CI checkout | MIT |
| actions/setup-node | v7 / `820762786026740c76f36085b0efc47a31fe5020` | CI Node setup | MIT |
| actions/upload-artifact | v7.0.1 / `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` | Verified release artifact transfer | MIT |
| actions/download-artifact | v8.0.1 / `3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c` | Verified release artifact retrieval | MIT |

Node built-in modules are used only by development tooling and the repository-local POC API; that API is excluded from the published package and the built-ins are not third-party dependencies.

This inventory does not replace a transitive dependency/SBOM review before a release. New runtime dependencies, scientific datasets, model weights, or calibration material require explicit provenance and license review.


## Automated license policy

The bounded DNG/TIFF and baseline JPEG encoders are independently authored.
No Adobe SDK, external encoder source, default quantization/Huffman tables,
calibration dataset or runtime dependency is incorporated. Numeric test profiles
and custom coding tables are owned synthetic fixtures, not camera calibration.

Format references:

- Adobe DNG and patent-license notice: https://helpx.adobe.com/camera-raw/desktop/dng-and-file-formats/digital-negative.html
- DNG specification: https://helpx.adobe.com/content/dam/help/en/photoshop/pdf/DNG_Spec_1_7_1_0.pdf
- ITU-T T.81 JPEG: https://www.w3.org/Graphics/JPEG/itu-t81.pdf
- JFIF: https://www.w3.org/Graphics/JPEG/jfif3.pdf
- Adobe XMP: https://developer.adobe.com/xmp/docs/xmp-specifications/
- CIPA Exif: https://www.cipa.jp/std/documents/e/DC-X008-Translation-2019-E.pdf

The DNG patent-license notice appears in `NOTICE` and exporter source. These
references do not authorize copying SDK code or scientific datasets. Human
provenance/license review remains required before release.

### Dependency allowlist

`npm run check:licenses` reviews every package recorded in `package-lock.json`.

Currently allowed without additional review:

- Apache-2.0
- MIT
- BSD-2-Clause
- BSD-3-Clause
- ISC
- BlueOak-1.0.0

MPL-2.0 is allowed only when the dependency is marked development-only in the lockfile.

Any missing, new, compound, or otherwise unrecognized license fails CI until it is reviewed and the policy is deliberately updated.

The allowlist is a review control, not a legal conclusion that every future use of an allowed license is automatically compatible. Redistribution context still matters.
