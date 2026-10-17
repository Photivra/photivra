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

`src/sensor/stochastic-seed.ts` independently implements the MurmurHash3_x86_32 algorithm and its `fmix32` finalizer (Austin Appleby). The upstream `MurmurHash3.cpp` header states the algorithm "is placed in the public domain" and disclaims copyright. The SMHasher test suite that contains it is a separate work: its README says "SMHasher is released under the MIT license". No SMHasher or MurmurHash3 source file is vendored or copied. `test/sensor-raw-noise-independence.test.ts` reimplements, in its own code, SMHasher's verification procedure (keys of 0–255 bytes hashed with seed 256 − i, then the hash of those hashes) and compares the result with the published MurmurHash3_x86_32 verification value 0xB0F57EE3, a published fact. Test vectors earlier copied from a Stack Overflow answer (CC BY-SA 3.0) were removed.

`src/optics/longitudinal-chromatic-aberration.ts` uses three physical constants: the Fraunhofer d (helium, 587.5618 nm), F (hydrogen, 486.1327 nm) and C (hydrogen, 656.2725 nm) spectral-line wavelengths used to define the Abbe number (as tabulated in SCHOTT Technical Information TIE-29, *Refractive Index and Dispersion*, 2023, free; also the reference wavelengths of ISO 7944). They are factual measured constants of nature, not a copied dataset or table; no glass catalogue data is included and refractive index and Abbe number are caller inputs. The 2.0 projection, distortion, Zernike/Seidel, vignetting, polarizer and haze models are independent implementations of published equations cited in `docs/PHYSICS_FOUNDATION.md` and `docs/PSF_FOUNDATION.md`; they contain no third-party code or numeric tables.

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
  - `NOTICE`, `README.md` and the DNG writer and reader sources (`src/capture/photographic-export.ts`, `src/capture/native-raw-dng.ts`, `src/capture/dng-import.ts`) carry "This product includes DNG technology under license by Adobe.", the exact notice the Adobe DNG patent licence requires in source code and documentation.
- **Concerns:**
  - **Adobe DNG patent licence (verified 2026-10-17).** The licence text was read on Adobe's Digital Negative page (<https://helpx.adobe.com/camera-raw/desktop/dng-and-file-formats/digital-negative.html>, section "Digital Negative (DNG) Specification patent license"; the 1.7.1.0 specification PDF itself carries no licence). It grants all individuals and organizations a worldwide, **royalty-free**, nonexclusive right under Adobe's essential patent claims to make, use and distribute software that **reads or writes** DNG files. Conditions: include the notice above in source code and documentation; Adobe may revoke the grant from a licensee that brings a DNG-related patent action against Adobe. Users receive the grant directly from Adobe, so nothing needs to be sublicensed under Apache-2.0. It covers only Adobe's DNG-essential patent claims, not referenced technologies (TIFF, JPEG, Exif, ICC, XMP) or other formats. This is a document check, not legal advice. The retrieval record [`docs/licenses/adobe-dng-patent-license-record.txt`](https://github.com/Photivra/photivra/blob/main/docs/licenses/adobe-dng-patent-license-record.txt) gives the URL, retrieval date, page SHA-256, the exact notice and a summary. It is not a copy of the licence, because Adobe's Terms of Use do not clearly allow copying text from its websites.
  - The `test/fixtures/print-detail/jpeg` files are written by `scripts/generate-print-detail-jpeg.mjs`, which builds and runs `scripts/generate-print-detail-jpeg.ts` with the repository's own `createPhotographicExportPair()` and `test/helpers/print-detail-jpeg-fixture.ts`. Their manifest has the fields that script writes and records `engineCandidate` 1.1.0.
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
| 28 coefficients of the engine's own multi-lobe CIE 1931 CMF fit (`color-matching-functions.ts`) | Fitted by Photivra with `scripts/fit-cie-1931-cmf.mjs` to the CIE 1931 2° table, DOI 10.25039/CIE.DS.xvudnb9b (CIE, CC BY-SA 4.0). The model form, a sum of piecewise Gaussians, follows the idea in Wyman, Sloan & Shirley (2013), JCGT 2(2); none of that paper's coefficients or text are used. | Fit-time use only: the script downloads the table into a temporary directory outside the repository, checks its SHA-256 and deletes it. No CIE value is stored in the repository, the package, the tests or the script's output. The committed coefficients are our own least-squares result; 28 numbers cannot reproduce the 1,413-value table (maximum error 0.022). Attribution to the CIE dataset is given here and in `docs/COLORIMETRY.md`. Replaced the Wyman et al. coefficients by owner decision (2026-10-17). |
| Daylight-locus polynomial and M₁/M₂ coefficients; illuminant A formula constants; CIELAB, CIE94 and CIEDE2000 formula constants (`illuminants.ts`, `color-difference.ts`) | CIE 15:2018 (daylight and illuminant A constants; values checked against the free CIE datasets); CIELAB as in W3C CSS Color 4; CIE94 as stated in Wikipedia, "Color difference" (secondary source; the primary CIE 116-1995 is not free); Sharma, Wu & Dalal (2005), also CIE 142-2001 | Coefficients of standardized equations, used as factual constants. |
| McCamy CCT cubic | McCamy (1992), Color Res. Appl. 17(2) | Published equation coefficients. |
| Bradford, CAT02, CAT16 and Hunt–Pointer–Estévez matrices (`chromatic-adaptation.ts`) | Lam (1985) / ICC.1:2010 Annex E; CAT02: Moroney et al. (2002) / CIE 159:2004; CAT16: Li et al. (2016), IS&T CIC24, Eq. (15), doi:10.2352/ISSN.2169-2629.2017.32.208 (free; checked 2026-10-17 to match the engine; journal version Li et al. 2017); HPE: CIE 159:2004 | Published 3×3 model constants. The free Li et al. (2016) paper names the CAT02 matrix but does not print it, so it is not cited for CAT02. |
| Primaries and white points; BT.709 and BT.1886 constants (`rgb-color-spaces.ts`) | ITU-R BT.709-6, BT.1886, BT.2020-2; W3C CSS Color 4 (`srgb`, `display-p3`); also IEC 61966-2-1, SMPTE EG 432-1 | Standardized numeric constants; every value is available from the freely published ITU-R and W3C documents. |
| h, c, k | BIPM SI Brochure (2019) | Exact SI defining constants (facts). |
| Standard output sensitivity S = 10/H, camera-equation constant 0.65 and the 18 % grey reference, K_m = 683 lm/W (`src/facade/`) | CIPA DC-004-2020 (free); BIPM SI Brochure, definition of the candela | Standardized scalar constants used as facts. The capture facade's charts (slanted edge, Siemens star, step wedge, grey ramp, checkerboard, point grid) are engine-authored analytic patterns; the slanted edge only follows the ISO 12233 geometry (a few degrees of slant, 4:1 contrast) and reproduces no chart artwork or data. |

The following datasets are deliberately **excluded**:

- **CIE tabulated datasets.** This covers the CIE 1931/1964 CMFs, the daylight components S₀/S₁/S₂ and the standard illuminant tables. They were verified on 2026-10-16 from the CIE dataset metadata (for example DOI 10.25039/CIE.DS.xvudnb9b and `CIE_illum_Dxx_comp.csv_metadata_v2.json`), which declare **CC BY-SA 4.0**. ShareAlike would bind adaptations, and this is not compatible with Apache-2.0-only distribution. The API accepts caller-supplied tables instead.
- **ColorChecker or other chart reflectances.** Their licence is unclear, so they are not included. Reflectances are supplied by the caller.

The tests assert no values taken from CIE tables, and no CIEDE2000 published test pairs (owner decision, 2026-10-17; the Sharma et al. data file carries no licence). They use internal consistency, normalization, round trips and values computed in the test from Planck's law, the daylight formula and the CIEDE2000 definitions. They still assert standard luminance coefficients and the published Bradford matrix as cited facts.

**Removed by owner decision (2026-10-17).** Two third-party coefficient sets were removed from the shipped code: the Wyman, Sloan & Shirley (2013) CMF coefficients (paper CC BY-ND 3.0), replaced by the engine's own fit above, and the Planckian-locus cubic-spline coefficients of Kang et al. (2002, J. Korean Phys. Soc. 41(6); also US 7,024,034, recorded as lapsed in 2018), replaced by Planck's law integrated against the engine's CMFs. Neither set nor the patent text remains in `src/`.

## Image-processing published parameters

The processing operators in `src/processing/` and the built-in Bayer kernels in `src/sensor/raw-reconstruction.ts` (see [docs/PROCESSING.md](https://github.com/Photivra/photivra/blob/main/docs/PROCESSING.md)) are independently written from published algorithm descriptions. They contain only short factual parameters. No third-party source code (including GPL demosaicing implementations), table, figure, image or prose is copied, and no runtime dependency or test image is added.

| Parameters | Source | Basis for use |
| --- | --- | --- |
| Burt–Adelson generating kernel [1, 4, 6, 4, 1]/16 (a = 0.375) | Burt & Adelson (1983) | Published equation parameter. |
| Well-exposedness σ = 0.2; key 0.18; range σ 0.4 and spatial σ 2% defaults | Mertens et al. (2007); Reinhard et al. (2002); Durand & Dorsey (2002) | Published default parameters. |
| Gain-compensation σ_N ≈ 10/255, σ_g = 0.1 | Brown & Lowe (2007) | Published parameters, rescaled to normalized intensity. |

The Malvar–He–Cutler demosaic kernels and their parameters, and the BT.2408 HDR reference-white and BT.2100 quantization constants used only by the PQ/HLG encoders, were removed from 2.0 (owner decision, 2026-10-17); see the patent review below.

## Patent review of 2.0 algorithms (public-record check, 2026-10-17, not legal advice)

| Algorithm | Patent record found | Finding |
| --- | --- | --- |
| Non-local means denoising | US 8,253,825 | Lapsed for unpaid maintenance fees; the EP counterpart was withdrawn. |
| Durand–Dorsey bilateral tone mapping | US 7,146,059 (MIT) | Expired February 8, 2025. |
| Burt–Adelson Laplacian pyramid (Sarnoff patents) | Sarnoff pyramid patents | Expired. |
| Focus stacking by pyramid fusion | US 5,325,449; IBM US 9,196,027 | US 5,325,449 expired. US 9,196,027 claims capture control, which the engine does not do. |
| Synthetic film grain | Thomson film-grain family | Lapsed. |
| AHD demosaic, bilateral filter, Reinhard tone mapping, Brown–Lowe gain compensation | None found | No patent found. |
| HDR bracket merge | Disney US 9,275,445 (in force to 2034) | Claims align-then-merge HDR. The engine's merge does no alignment and requires pre-aligned input (`docs/PROCESSING.md`). |
| Exposure fusion pyramid blending | CyberLink US 8,885,976 (in force to 2034) | Claims a specific merged-pyramid variant. The engine uses standard Mertens et al. (2007) Laplacian-pyramid fusion and does not use that variant (note also in `docs/PROCESSING.md` and `src/processing/tone-mapping.ts`). Public-record note, not legal advice. |
| Malvar–He–Cutler demosaic | Microsoft US 7,502,505 (in force to about January 25, 2027) | Claim 1 closely matches the method, so it was removed from 2.0 (owner decision, 2026-10-17). It may return after the patent expires. |
| PQ transfer function (SMPTE ST 2084, ITU-R BT.2100) | Dolby: SMPTE ST 2084 patent declaration, option B1 (free of charge, with reciprocity), July 30, 2015, and ITU-R BT.2100 declaration option 2.1; US 11,887,560 in force to about 2032 | Only free-of-charge licence-on-request declarations, not a licence or non-assert: a licence must still be requested. Removed from 2.0 by owner decision (2026-10-17). |
| HLG transfer function (ITU-R BT.2100, ARIB STD-B67) | BBC: free-of-charge declarations to the ITU and SMPTE. NHK: only a 2001 general RAND statement. Thomson: RAND declaration PCT/EP16/051552 on BT.2100. ARIB STD-B67 lists no essential patents | Licence-on-request (free of charge or RAND) declarations, not licences or non-asserts. Removed from 2.0 by owner decision (2026-10-17). |
| CAT02 and CAT16 chromatic-adaptation matrices | None found | No patent found claiming the CAT02 or CAT16 matrix (USPTO full-text; Google Patents partial); the CIE attaches no usage condition; the search outside the US was partial. |

## Print contrast numerical model material

The original scalar adapter in `src/output/print-contrast-reference.ts` uses numerical equations/parameters from [castleCSF revision f4b0b722af83001d7af979281e06ca642d36e4e8](https://github.com/gfxdisp/castleCSF/tree/f4b0b722af83001d7af979281e06ca642d36e4e8): `matlab/CSF_castleCSF.m`, `CSF_stelaCSF_lum_peak.m`, `CSF_castleCSF_chrom.m` and `CSF_base.m`. The upstream code/model material is MIT-licensed, copyright (c) 2023 Graphics and Displays group - University of Cambridge. The exact license is preserved at `docs/licenses/castleCSF-MIT.txt` and its notice is retained in `NOTICE` and adapter source. New TypeScript/reference code is distributed under the project Apache-2.0 terms while retaining the MIT notice for upstream numerical material.

No upstream observational CSV, paper text/figure/table, color-matching dataset or runtime dependency is incorporated. The model's presence does not certify camera, print, observer or natural-image visibility applicability. [The model/protocol](https://github.com/Photivra/photivra/blob/main/docs/PRINT_CONTRAST_REFERENCE.md) records the restricted envelope, independent numerical evaluation and pending human scientific/source/license review. The root still declares no runtime npm dependencies.


## Optional offline physical-proof tools

The optional repository-only QA scripts `scripts/verify-photographic-export-fixtures.py` and `scripts/verify-producer-export-acceptance.py` load an installed LibRaw (LGPL-2.1 or CDDL-1.0) dynamically through its C API. Nothing from LibRaw is copied or distributed, and the scripts are not part of the package.

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
