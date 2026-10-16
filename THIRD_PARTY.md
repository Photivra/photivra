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

`src/sensor/stochastic-seed.ts` independently implements the MurmurHash3_x86_32 algorithm and its `fmix32` finalizer (Austin Appleby, SMHasher). The upstream `MurmurHash3.cpp` header states the algorithm "is placed in the public domain" and disclaims copyright. No upstream source file is vendored; the implementation is checked against published test vectors in `test/sensor-raw-noise-independence.test.ts`.

This inventory does not replace a transitive dependency/SBOM review before a release. New runtime dependencies, scientific datasets, model weights, or calibration material require explicit provenance and license review.

## Pending licence and source reviews

These human reviews are **pending**. This inventory records them; it does not complete them. Each is described in full in its section below.

- castleCSF-derived contrast reference (`src/output/print-contrast-reference.ts`): human scientific/source/license review pending.
- ReportLab/pypdf offline PDF test-artifact tools: substantive human source review pending.
- DNG/TIFF and JPEG format references: human provenance/license review required before release.
- Transitive dependency/SBOM review: required before each release; this inventory does not replace it.
- Colorimetry published constants (`src/color/`): human source/licence review pending. See [Colorimetry published constants and excluded datasets](#colorimetry-published-constants-and-excluded-datasets).

## Licence summaries (prepared for owner sign-off)

Prepared on 2026-10-11 from local files only (repository files, `package-lock.json` and locally installed package metadata). These are factual summaries for the owner to sign off; they are **not** completed reviews, and every item above stays pending until the owner signs off at production release. "Not verified" means the fact could not be checked locally.

### castleCSF-derived contrast reference

- **Declared licence:** MIT, from the retained upstream text `docs/licenses/castleCSF-MIT.txt` (revision `f4b0b722af83001d7af979281e06ca642d36e4e8`).
- **Copyright holder:** "Copyright (c) 2023 Graphics and Displays group - University of Cambridge" (from that file).
- **Permissions:** MIT permits commercial use, modification, redistribution and sublicensing.
- **Obligations:** the copyright and permission notice must be included in all copies or substantial portions. It is currently kept in `docs/licenses/castleCSF-MIT.txt`, in `NOTICE` and in the header of `src/output/print-contrast-reference.ts`. `NOTICE` and `docs` are listed in the published package `files`.
- **Concerns:** whether the upstream repository holds model or parameter material under other terms (paper, datasets) is not verified locally; this summary covers only the retained MIT text. The licence summary does not cover the separate scientific/source review.

### ReportLab / pypdf offline PDF test-artifact tools

- **Declared licence:** ReportLab: "BSD license" (METADATA; classifier "OSI Approved :: BSD License"), with a BSD-3-Clause-style `LICENSE` file. pypdf: `License-Expression: BSD-3-Clause` with a matching `LICENSE` file.
- **Copyright holder:** ReportLab: "Copyright (c) 2000-2024, ReportLab Inc." (LICENSE; METADATA says 2000-2025). pypdf: "Copyright (c) 2006-2008, Mathieu Fenniak", with contributions copyright Ashish Kulkarni (2007) and Steve Witham (2014).
- **Permissions:** both licences permit commercial use, modification and redistribution in source and binary form.
- **Obligations:** keep the copyright notice, conditions and disclaimer on redistribution, and do not use the contributors' names for endorsement. Neither tool is vendored or redistributed here, so no notice is currently owed.
- **Concerns:**
  - The installed versions are ReportLab 5.0.1 and pypdf 6.17.0. The versions recorded for the committed artifact (ReportLab 4.4.9, pypdf 6.10.0) are not installed locally, so their exact licence files are not verified.
  - The ReportLab distribution also bundles font files, including DarkGarden (with a GPL copying file) and Vera. The committed `output/pdf/print-proof-reference.pdf` contains no `FontFile` entries and declares only `/BaseFont /Helvetica`, so no bundled font program is embedded (checked locally).

### DNG/TIFF and JPEG sample provenance

- **Declared licence:** project Apache-2.0 (`LICENSE`, `package.json`). There are 26 tracked `.dng`/`.jpg` files under `test/fixtures/paired-export-acceptance`, `test/fixtures/producer-export-acceptance`, `test/fixtures/print-detail/jpeg` and `docs/validation/native-raw-print-2026-10-04`. Their READMEs and manifests describe them as Photivra-owned synthetic outputs of this repository's own encoders. The generators are `scripts/generate-photographic-export-fixtures.mjs`, `scripts/generate-producer-export-acceptance.mjs` and `scripts/generate-native-print-jpeg.mjs`. The adjacent `srgb.icc` is written by the engine's own `createSrgbIccProfile()`.
- **Copyright holder:** "Copyright 2026 William Shackelford" (`NOTICE`).
- **Permissions:** Apache-2.0 permits commercial use, modification and redistribution.
- **Obligations:**
  - Apache-2.0 requires keeping `LICENSE` and `NOTICE`, and marking modified files.
  - `NOTICE` and `src/capture/photographic-export.ts` carry "This product includes DNG technology under license by Adobe", which is the attribution the Adobe DNG patent licence asks for.
- **Concerns:**
  - The exact Adobe DNG patent-licence text is not stored locally, so its conditions are not verified.
  - The generator for the `test/fixtures/print-detail/jpeg` files was not located locally (their manifest records only `engineCandidate`), so their generator is not verified.
  - Provenance comes from the repository's own records; the files were not regenerated byte for byte in this pass.

### Per-release transitive dependency / SBOM review

- **Declared licence:** for the current `package-lock.json` (168 package entries), the declared licence counts are MIT 125, Apache-2.0 15, ISC 7, BSD-2-Clause 6, BSD-3-Clause 2, BlueOak-1.0.0 1 and MPL-2.0 12. All 12 MPL-2.0 entries are `lightningcss` and its platform binaries, marked `dev`. The single BlueOak-1.0.0 entry is `minimatch`, also `dev`. The root package declares no runtime `dependencies`.
- **Copyright holder:** per package; not compiled in this pass (not verified).
- **Permissions:** every declared licence is on the repository allowlist, and each permits commercial use, modification and redistribution.
- **Obligations:** no third-party npm code is in the published package, so redistribution notices arise only if that changes. MPL-2.0 file-level copyleft would apply only if `lightningcss` files were modified and distributed.
- **Concerns:**
  - The figures come from declared lockfile metadata, not licence texts.
  - The review must be repeated against each release's exact lockfile.
  - The GitHub Action licences in the table above are not verified locally.

## Colorimetry published constants and excluded datasets

The colorimetry modules in `src/color/` (see [docs/COLORIMETRY.md](https://github.com/Photivra/photivra/blob/main/docs/COLORIMETRY.md)) are independently written from published equations. They contain only short factual numeric constants taken from those equations. No third-party source code, table, figure or prose is copied, and no runtime dependency is added.

| Constants | Source | Licence / basis for use |
| --- | --- | --- |
| 28 fitted coefficients of the multi-lobe CIE 1931 CMF fit (`color-matching-functions.ts`) | Wyman, Sloan & Shirley (2013), JCGT 2(2), Table 1 | The paper is CC BY-ND 3.0. Only the published model parameters are used, as factual inputs to an independently written equation; no text, figure or code is reproduced. |
| Daylight-locus polynomial and M₁/M₂ coefficients; illuminant A formula constants; CIELAB, CIE94 and CIEDE2000 formula constants (`illuminants.ts`, `color-difference.ts`) | CIE 15:2018, CIE 116-1995, CIE 142-2001; Sharma, Wu & Dalal (2005) | Coefficients of standardized equations, used as factual constants. |
| Planckian-locus cubic-spline coefficients (`illuminants.ts`) | Kang et al. (2002), J. Korean Phys. Soc. 41(6); US 7,024,034 | Published equation coefficients. The patent claims an HDTV colour-temperature control system; using the published locus approximation for calculation is not reviewed here as a patent question and needs the human review. |
| McCamy CCT cubic | McCamy (1992), Color Res. Appl. 17(2) | Published equation coefficients. |
| Bradford, CAT02, CAT16 and Hunt–Pointer–Estévez matrices (`chromatic-adaptation.ts`) | Lam (1985) / ICC.1:2010 Annex E; Moroney et al. (2002) / CIE 159:2004; Li et al. (2017); CIE 159:2004 | Published 3×3 model constants. |
| Primaries and white points; PQ, HLG, BT.709 and BT.1886 constants (`rgb-color-spaces.ts`) | IEC 61966-2-1, ITU-R BT.709-6, BT.1886, BT.2020-2, BT.2100-3, SMPTE ST 2084, SMPTE EG 432-1 | Standardized numeric constants; the ITU-R recommendations are freely published. |
| h, c, k | BIPM SI Brochure (2019) | Exact SI defining constants (facts). |

The following datasets are deliberately **excluded**:

- **CIE tabulated datasets.** This covers the CIE 1931/1964 CMFs, the daylight components S₀/S₁/S₂ and the standard illuminant tables. They were verified on 2026-10-16 from the CIE dataset metadata (for example DOI 10.25039/CIE.DS.xvudnb9b and `CIE_illum_Dxx_comp.csv_metadata_v2.json`), which declare **CC BY-SA 4.0**. ShareAlike would bind adaptations, and this is not compatible with Apache-2.0-only distribution. The API accepts caller-supplied tables instead.
- **ColorChecker or other chart reflectances.** Their licence is unclear, so they are not included. Reflectances are supplied by the caller.

The tests assert a few individual published values (for example one CMF sample at 479 nm, the column sums from the CIE metadata, 13 CIEDE2000 test pairs, and standard luminance coefficients) as cited facts. They do not reproduce any table.

## Print contrast numerical model material

The original scalar adapter in `src/output/print-contrast-reference.ts` uses numerical equations/parameters from [castleCSF revision f4b0b722af83001d7af979281e06ca642d36e4e8](https://github.com/gfxdisp/castleCSF/tree/f4b0b722af83001d7af979281e06ca642d36e4e8): `matlab/CSF_castleCSF.m`, `CSF_stelaCSF_lum_peak.m`, `CSF_castleCSF_chrom.m` and `CSF_base.m`. The upstream code/model material is MIT-licensed, copyright (c) 2023 Graphics and Displays group - University of Cambridge. The exact license is preserved at `docs/licenses/castleCSF-MIT.txt` and its notice is retained in `NOTICE` and adapter source. New TypeScript/reference code is distributed under the project Apache-2.0 terms while retaining the MIT notice for upstream numerical material.

No upstream observational CSV, paper text/figure/table, color-matching dataset or runtime dependency is incorporated. The model's presence does not certify camera, print, observer or natural-image visibility applicability. [The model/protocol](https://github.com/Photivra/photivra/blob/main/docs/PRINT_CONTRAST_REFERENCE.md) records the restricted envelope, independent numerical evaluation and pending human scientific/source/license review. The root still declares no runtime npm dependencies.


## Optional offline physical-proof tools

The owned PDF geometry reference is generated with ReportLab 4.4.9 and independently inspected with pypdf 6.10.0. Their installed distribution license files were reviewed as BSD-3-Clause-style terms (ReportLab metadata calls its license BSD; pypdf declares BSD-3-Clause). These are optional offline test-artifact tools, not runtime/npm dependencies. No library source, binary or embedded font program is vendored. The PDF preserves existing owned JPEG streams and uses the PDF standard Helvetica font declaration; its DeviceRGB appearance and actual printing remain unqualified. Generator/parser versions and artifact hashes are retained in the candidate evidence record. Substantive human source review remains pending.

## Automated license policy

The bounded DNG/TIFF and baseline JPEG encoders, the DNG/TIFF-EP reader, the
lossless JPEG (T.81 Annex H) decoder and the PNG/zlib/DEFLATE encoder are
independently authored. No Adobe SDK, external encoder or decoder source, default
quantization/Huffman tables, calibration dataset or runtime dependency is
incorporated. Only factual identifiers from the standards are used: tag numbers,
field types, marker codes, PNG chunk layouts, the sRGB gAMA/cHRM values the PNG
specification prescribes, H.273 code points, RFC 1951 fixed-code and length/distance
base tables, and the Exif 2.32 default values (72 dpi, `0100`, `0232`, Y Cb Cr).
The 64 JPEG DCT cosine constants are correctly rounded values of
cos((2x+1)uπ/16), computed by the project; they are mathematical facts. Numeric test profiles
and custom coding tables are owned synthetic fixtures, not camera calibration.

Format references:

- Adobe DNG and patent-license notice: https://helpx.adobe.com/camera-raw/desktop/dng-and-file-formats/digital-negative.html
- DNG specification: https://helpx.adobe.com/content/dam/help/en/photoshop/pdf/DNG_Spec_1_7_1_0.pdf
- ITU-T T.81 JPEG: https://www.w3.org/Graphics/JPEG/itu-t81.pdf
- JFIF: https://www.w3.org/Graphics/JPEG/jfif3.pdf
- Adobe XMP: https://developer.adobe.com/xmp/docs/xmp-specifications/
- CIPA Exif: https://www.cipa.jp/std/documents/e/DC-X008-Translation-2019-E.pdf
- TIFF 6.0: https://www.itu.int/itudoc/itu-t/com16/tiff-fx/docs/tiff6.pdf
- PNG Third Edition (W3C Recommendation 24 June 2025): https://www.w3.org/TR/png-3/
- zlib (RFC 1950) and DEFLATE (RFC 1951): https://www.rfc-editor.org/rfc/rfc1950, https://www.rfc-editor.org/rfc/rfc1951
- ITU-T H.273 code points: https://www.itu.int/rec/T-REC-H.273

RAW development and tone-mapping references (2.0; published equations and
factual constants only, independently implemented; no code or data copied):

- DNG 1.7.1.0 tag definitions (WhiteLevel, BlackLevel/ActiveArea phase,
  AsShotNeutral, ForwardMatrix1, BaselineExposure, NoiseProfile, AnalogBalance):
  the DNG specification above.
- EMVA 1288 Release 4.0, saturation point and photon-transfer noise model:
  https://www.emva.org/standards-technology/emva-1288/
- Reinhard, Stark, Shirley & Ferwerda (2002), "Photographic tone reproduction
  for digital images", ACM SIGGRAPH, eq. 3 and 4.
- Naka & Rushton (1966), J. Physiol. 185:536-555; Reinhard & Devlin (2005),
  "Dynamic range reduction inspired by photoreceptor physiology", IEEE TVCG 11(1).
- Guo, Cheng & Hu (2010), "Correcting over-exposure in photographs", CVPR
  (highlight desaturation concept for the engine-defined `reconstruct` mode).
- dcraw manual, `-H 0` "clip all highlights to solid white" (documented
  behaviour only; no dcraw code used): https://www.dechifro.org/dcraw/dcraw.1.html
- Bradford cone matrix (Lam 1985), already used by the ICC serializer, now also
  for ForwardMatrix1.

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
