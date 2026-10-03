# Regional detail paired-export JPEG evidence 0.1.0

This addendum to [the regional diagnostic protocol](PRINT_DETAIL_VALIDATION.md) qualifies only a bounded execution test: owned post-ADC RAW codes → public paired-export reconstruction/color/SDR/JPEG → independently recorded JPEG decode → neutral relative-linear luminance → regional fundamental. It extends [the capture-SDR execution evidence](PRINT_DETAIL_SDR_EVIDENCE.md) without changing the metric, public API, dependencies or historical records. Human scientific/source review remains pending; full #196 acceptance remains blocked.

## Owned source and target truth

`test/helpers/print-detail-jpeg-fixture.ts` supplies a native 20 × 16 periodic Bayer frame. Every complete 2 × 2 tile has one neutral post-ADC code from repeating `[640,448,256,448]`. Black is 64 and white is 1023, so linear tile levels are `[576,384,192,384]/959`. Source mean is `384/959`; the two-sample-held eight-pixel period has fundamental modulation `0.5 cos(pi/8)`. This follows the discrete hold's half-sample phase and cosine attenuation. The target contains known higher harmonics and is not a pure continuous optical sinusoid. Only its declared coherent Fourier fundamental is assessed; its residual cannot be classified as noise or a compression artifact.

This is owned synthetic draft post-ADC data, not a renderer-acquired optical target or noise realization. The existing declared ideal test color profile and tile-average reconstruction are reused. Neither becomes physical calibration. The source's placeholder float plane does not supply JPEG pixels: the public export develops the committed RAW codes. The independent Python check derives expected neutral pre-encode codes from the source codes and explicit orientation permutation, with no engine imports. It separately verifies the source's fundamental identity.

## Exact stage and independent reference

Eight committed JPEGs cover all four orientations at constant quantization steps 1 and 32. These are scalar encoder parameters, not manufacturer's quality scores. Each orientation has a distinct capture ID; its quantization variants retain that same capture identity, with unique document/instance IDs for each exported file. The public exporter executes orientation itself, writes already oriented JPEG pixels, and declares EXIF orientation 1. Native 20 × 16 becomes 20 × 16 or 16 × 20. Partial eight-pixel coding blocks exercise the encoder's edge padding without changing the declared raster. The selected off-center half-open ROI begins at `(2,2)` and is 16 × 8 in landscape or 8 × 16 in portrait; it spans two target periods and JPEG block boundaries.

`export-manifest.json` records actual source codes, pre-encode RGB, JPEG SHA-256, raster, target and ROI identities. `independent-reference.json` binds to its exact bytes and records installed Pillow/libjpeg/Python versions, independently decoded RGB bytes/hash, ROI float64 little-endian bytes/hash and separately calculated pre-encode/decoded coefficients. The verifier requires neutral equal decoded RGB channels; each inverse-transferred channel is then relative linear luminance. It does not define a colored RGB luminance extractor, ICC transform or generic decoder policy.

The independent reference calculates mean, cosine/sine coefficients, amplitude, modulation and residual using Python `math.fsum`, independently of the engine accumulator. Every Node test regenerates actual paired-export JPEG bytes and requires exact agreement with the committed JPEG, manifest hash and independent decoded-byte record. It converts the recorded neutral pixels to linear values, compares each ROI sample within absolute 1e-12, and compares all regional measurements within 1e-10. These are numerical tolerances for 128 positive bounded samples, not perceptual thresholds. Integer bytes, raster identities and hashes are exact checks. Node CI consumes committed independent decode evidence; it does **not** execute Pillow anew.

The actual runtime linear luminance plane receives a separate float64 little-endian SHA-256 carried unchanged through the diagnostic input/result. It is linked by the test to the exact JPEG and decoder record. The public diagnostic still returns `caller-declared-unverified`, unknown scientific assurance and `not-offered` overall verdict; it performs no IO or automatic provenance upgrade.

## Reproduction and invalidation

```sh
node scripts/generate-print-detail-jpeg.mjs /tmp/photivra-print-jpeg-reproduction
python scripts/verify-print-detail-jpeg.py /tmp/photivra-print-jpeg-reproduction --record
python scripts/verify-print-detail-jpeg.py test/fixtures/print-detail/jpeg
npx vitest run test/print-detail-jpeg-integration.test.ts
```

Generation uses the repository's existing development compiler. Python QA uses an existing installed Pillow; no engine/runtime/development dependency or CI install is added. A missing Pillow fails the independent check rather than silently passing. `--record` writes a new candidate reference for review; verification without it requires the committed decoder versions and results to agree. Preserve old records when the source, reconstruction, color model, renderer, encoder, registration, target, ROI, metric or decoder changes. Regeneration is evidence collection, not human approval. [The separate evidence ledger](validation/print-detail-jpeg-evidence.json) pins source hashes and the finite execution envelope.

Fine quantization preserves this target's measured regional modulation within numerical tolerance. Coarse quantization changes it and may increase the fundamental or residual. An increased transfer coefficient does not imply restored detail, improved quality, invisibility or a compression pass. Source RAW, pre-encode RGB and native raster remain unchanged between quantization variants; only the exact encoded representation and its diagnostic differ.

## Remaining qualification

This evidence covers one owned neutral stepped grating, one source/processing policy, one selected ROI per orientation and one recorded independent decoder configuration. It does not qualify optical acquisition/MTF, spectral color calibration, other targets/frequencies/depths, noise/aliasing/halos/compression classifiers, generic image codecs or decoder variants, resampling/warp, native-resolution production, UI/GPU/device/display execution, observer perception or printer/substrate response. No JPEG quality verdict is introduced. Full scoped new-UI acceptance remains blocked until the missing evidence and substantive human review are complete.
