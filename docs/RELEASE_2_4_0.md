# 2.4.0 release candidate

> **Release request.** Prepared October 18, 2026. Publishing is a separate step: the owner tags `v2.4.0` on the `main` commit that merges this record, and npm publishing runs from the tag.

## At a glance

- **What is proposed:** publish `@photivra/engine@2.4.0`, with `ENGINE_API_VERSION = "2.4.0"`. `POC_SIMULATION_API_VERSION` stays `1.0.0`.
- **Why a minor version:** the one change is additive and opt-in. Without the new input every request, plan, RAW, image, encoded file and hash lock is byte-identical to 2.3.0, apart from the engine version that captures record. No root export is removed, and no input that 2.3.0 accepted is rejected.
- **Why now:** applications that export captures need to label the files (what the image shows, which software made it, who holds the rights, a free comment) in standard fields that image viewers read. The owner approved the 2.4.0 feature and its release preparation on October 18, 2026. The feature merged in #344 (`62f426c`).
- **What this release does not claim:** the engine writes the caller's text as given. It does not check that a description is true or that a rights statement is valid, and it adds no text of its own beyond the DNG's existing simulated-RAW statement.

## Scope

| Change | Public surface | Kind |
| --- | --- | --- |
| Caller text metadata in JPEG, PNG and DNG files from `simulateCapture` (and a PNG `simulateIdealReference`) | `output.metadata`, assumption `output.metadata` | Additive, opt-in |
| Caller text metadata for directly written DNGs | `serializeNativeRawDng` `textMetadata` | Additive, opt-in |
| Metadata type | `OutputTextMetadata` | Additive |
| Version 2.4.0, changelog and this record | — | Release preparation |

Root exports grow from 1,713 to 1,714 symbols (1 added: `OutputTextMetadata`). Comparing the generated `docs/api/exports.json` with `v2.3.0` shows none removed.

## What changed, with evidence

### Text metadata (`output.metadata`, `textMetadata`)

Four optional fields, `description`, `software`, `copyright` and `comment`, at least one given. Each is 1–2048 UTF-8 bytes; NUL, lone UTF-16 surrogates, U+FFFE/U+FFFF and control characters other than line feed are rejected with an `InvalidConfigurationError` that names the field. Other output formats reject `output.metadata`.

| Field | JPEG | PNG | DNG |
| --- | --- | --- | --- |
| `description` | XMP `dc:description` | `Description` | ImageDescription after the simulated-RAW statement (ASCII only); XMP `dc:description` |
| `software` | XMP `xmp:CreatorTool` | `Software` | XMP `xmp:CreatorTool` |
| `copyright` | XMP `dc:rights` | `Copyright` | Copyright tag 33432 (ASCII only); XMP `dc:rights` |
| `comment` | COM segment and XMP `exif:UserComment` | `Comment` | XMP `exif:UserComment` |

Specifications followed (all free to read):

- **JPEG.** The file already carries one XMP packet in APP1 (the print plan). XMP allows one main packet of at most 65 502 bytes (Adobe XMP Specification Part 3, 2020, §1.1.3, §1.1.3.1), so the fields go into it as a second top-level `rdf:Description` of the same resource, which Part 1 (2012, the text of ISO 16684-1:2011) §7.4 allows. Property types follow Part 1 §8.3–8.4 and Part 2 (2022) §3.4 (Exif namespace). The comment is also written as a COM segment (ITU-T T.81 §B.2.4.5) after the APPn segments. The Exif block is not rewritten, so its offsets and Software tag are unchanged.
- **PNG.** One chunk per field with the predefined keywords (W3C PNG Specification, Third Edition, §11.3.3.1): `tEXt` for printable Latin-1 and line feed (§11.3.3.2), otherwise an uncompressed `iTXt` in UTF-8 (§11.3.3.4), placed before the first IDAT (§12.9).
- **DNG.** TIFF ASCII tags only for printable ASCII text (TIFF 6.0 §2); an XMP packet in tag 700 (XMP Part 3 §1.1.6, Table 13) always carries every field in UTF-8, with the TIFF-to-XMP mapping of Part 3 §3.2.3. The Software tag keeps naming the writer.

Tests (`test/output-text-metadata.test.ts`) parse each container back: the XMP packet and COM segment, the PNG text chunks with their CRCs (checked with Node's zlib), and DNG IFD0 and tag 700. They check that every other segment, chunk and tag is unchanged, that DNG codes read back identically through `parseDngRawImage`, that the worst-case escaped fields still fit one APP1 segment, determinism, and 14 validation cases. In #344, Pillow 12.3 and ImageMagick 6.9 read the PNG text and JPEG comment, and Python's XML parser read both XMP packets.

## Compatibility

- **Additive:** 1 root type; optional inputs `output.metadata` and `serializeNativeRawDng` `textMetadata`; an `output.metadata` assumption only when metadata is given.
- **Unchanged at the defaults:**
  - Hash locks on the facade's JPEG, 8-bit sRGB PNG, 16-bit Display P3 PNG, dated DNG and ideal-reference PNG bytes, recorded on `v2.3.0` (`0e7a046`) before the feature, pass on this candidate. Like the 2.0.0 lock in `test/simulate-capture-optics.test.ts`, the DNG lock writes the Software tag's engine version ("Photivra 2.4.0") back to the 2.3.0 name, which has the same length, before hashing; every other byte stays locked. That lock change is the only test change in this release preparation.
  - The existing hash locks (including the 2.0.0 lock and the `simulate-capture-integration` locks) pass unchanged.
  - A fingerprint of 15 default-path results matched `v2.3.0` byte for byte once the engine version is normalized: 12 `simulateCapture` requests (JPEG with fixed and automatic white balance, 8-bit and Display P3 16-bit PNG, `srgb-8`, `srgb-16` with mirror borders, two DNGs, caller patches, a fixed-size composite with zone-plate and dead-leaves elements, diffraction with the box aperture, and a dead-leaves region) and 3 `simulateIdealReference` requests. Each covers the whole result: samples, RAW codes, encoded bytes, assumptions, plan, request, exposure, scene digest, diagnostics (timings zeroed) and provenance. The engine version appeared 65 times in both runs and was the only difference.

## Rights and licensing

- **No third-party code, data or constants added.** The writers are written for the engine from the cited free specifications; nothing is copied from them or from any library.
- **No new runtime dependency.** `package.json` and `package-lock.json` changed only in their version fields.

## Privacy and security

No network, persistence or telemetry is added. The engine writes only text the caller passes, and only when the caller passes it; nothing about the user, device or time is added. Every field is validated strictly (unknown fields rejected, length and character checks) before any file is written, XML special characters are escaped in XMP, and the JPEG writer fails closed when a packet would not fit one APP1 segment. Callers should treat anything they put in these fields as public, because it travels with the file.

## Release gates

The authoritative result is GitHub CI on the exact commit that is tagged: the `main` commit that merges this record. Tag it only when its CI is green. Local results on this candidate are recorded in its pull request.

## Remaining release checklist

- [x] The 2.4.0 feature merged with its changelog entry (#344).
- [x] Version surfaces aligned at 2.4.0 (`npm run release:prepare -- 2.4.0`); API reference regenerated (1,714 root symbols; none removed).
- [ ] Owner's review of this record.
- [ ] Green CI on this pull request, then on `main` after merge.
- [ ] **The owner's explicit approval to tag `v2.4.0`.**
- [ ] After publication: npm version, dist-tag, integrity and provenance verified; GitHub release notes published; publication dates updated in `CHANGELOG.md`, `README.md`, `SECURITY.md` and this record.
