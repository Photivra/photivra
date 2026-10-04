# Native RAW and Print candidate contracts

Version 1.4.0 is a release candidate. It has not been published, tagged or adopted by a production application.

The separate `createNativeRawTask` contract accepts metadata without an inline image plane, then produces exact owned native codes, black levels, digital saturation codes and independent physical/pre-ADC/digital flags. Admission is limited to 24 million sites, 16,384 pixels per dimension, 256 sites per tile, and an explicitly admitted seven-byte-per-site payload. The reference 4,096-site RAW path is unchanged. Absolute CFA coordinates and absolute-index charge/read-noise seeds preserve reference arithmetic across tile boundaries.

`createNativeEnvironmentRawTask` invokes actual source radiance callbacks through shared projection, shutter, optical throughput, pupil/PSF and EQE calculations. It admits no more than 100,000 source evaluations per tile and requires a whole-event budget no greater than two billion. Source visibility, measured radiometry, convergence and physical transport remain provider responsibilities. The optional immutable photo-tile observer exposes bounded expectation values before noise or clipping. Observer failures and cancellation withhold output. `productionPlanActivated` and transport verification remain false.

`createNativeRawDevelopmentTask` snapshots one exact packed RAW and applies the shared reconstruction kernels, declared camera RGB-to-XYZ approximation, white balance exactly once, and shared SDR rendering. Every used phase and kernel halo must lie inside actual native support: no padding or weight renormalization. Output crop and orientation are bound to the capture geometry; this stage supports 1:1 output sampling. Retained payload admission counts the owned RAW copy and integer output, not caller buffers, JavaScript heap or GPU storage.

All tasks require host yields, publish only whole successful outputs, distinguish failure/cancellation/disposal, and transfer output ownership once. Typed storage must have an exact owned ArrayBuffer; shared buffers and hidden larger parent allocations are rejected. Metadata provenance and declared hashes do not establish producer authenticity.

## Print stage

`createPrintJpegTask` accepts explicitly encoded sRGB 8-bit RGB in an already oriented output raster. It crops only within actual source support and rejects enlargement, stretching and unsupported aspect ratios. Original area filtering decodes this declared post-SDR stage to linear values, integrates exact pixel overlap, then encodes and quantizes sRGB. This does not recover sensor headroom or reprocess RAW. Source reads are bounded to 256 × 32 pixels; JPEG coding uses 8 × 8 blocks. Edge replication is restricted to final JPEG coding blocks, not reconstruction or crop support.

The original baseline JPEG encoder embeds an original ICC v4.3 sRGB matrix/TRC profile, EXIF orientation 1, sRGB ColorSpace and final pixel dimensions. Its XMP records the immutable Print plan and declares source bytes unverified. Encoded output is explicitly budgeted to at most 256 MB and provider reads to one million. The caller owns the final file and must separately qualify browser save/share, byte-size requirements and printer/substrate appearance.

The ICC serializer uses the existing engine sRGB primaries and transfer function, standard numerical Bradford adaptation to D50 PCS and original ICC tag serialization. This profile adaptation does not introduce a shooting white-balance model. Numerical facts and format references: [ICC sRGB interpretation](https://registry.color.org/rgb-registry/files/sRGB.pdf), [ICC profile specification](https://www.color.org/icc34.pdf). No third-party ICC profile bytes or implementation were redistributed.

## Reproducible validation

`test/native-raw.test.ts`, `test/native-environment-raw.test.ts`, `test/native-raw-development.test.ts` and `test/print-jpeg.test.ts` cover small-reference parity, absolute odd-width phase/seed boundaries, orientation, signed below-black noise, whole-output budgets, corrupt providers, support halos and cancellation/ownership.

Run the optional actual megapixel test with `PHOTIVRA_VALIDATE_MEGAPIXEL_RAW=1 PHOTIVRA_RAW_REPORT=/tmp/native-raw-report.json npx vitest run test/native-raw-megapixel.test.ts`. It executes every one of a million native sites, develops that exact RAW and downsamples to a 500 × 500 ICC JPEG. The constructed count inputs are not a qualified megapixel scene-radiance capture.

Generate the separate original color, checker, asymmetric fractional crop, gray ramp and one-megapixel JPEG controls with `node scripts/generate-native-print-jpeg.mjs /tmp/native-print`. Validate actual bytes using `python scripts/verify-native-print-jpeg.py /tmp/native-print /tmp/native-print/validation.json` in an environment with NumPy and Pillow/LittleCMS. The independent area oracle expects 188 for a half-black/half-white sRGB checker reduction, rather than an encoded-value average. JPEG tolerance is four encoded codes; the original ICC is compared against LittleCMS sRGB over a 17³ color cube with a one-code budget.

These controls do not qualify all product fixtures, calibrated sensor/lens behavior, diffraction, full production depth composition, physical phone/tablet resources, printer appearance, platform save/share or substantive human review. See the application qualification record for its separate source and deployment gates.

## Standalone bounded Print example

This executable control declares a constant encoded RGB source. The zero digest is a placeholder declaration and is not authenticated by the engine; a product should bind its actual retained artifact and enforce qualification before offering export.

```ts
import { createPrintJpegTask, createSrgbIccProfile } from '@photivra/engine';
const source = { captureId: 'owned-control', imageStateId: 'encoded-control', artifactId: 'constant-gray',
  sha256: '0'.repeat(64), width: 16, height: 16, encoding: 'encoded-srgb-8-rgb' as const };
const task = createPrintJpegTask({ source, crop: { x: 0, y: 0, width: 16, height: 16 },
  outputWidth: 8, outputHeight: 8, quantizationStep: 1, maximumEncodedBytes: 16000, maximumProviderReads: 100 }, {
  readTile: async request => ({ ...request, samples: new Uint8Array(request.width * request.height * 3).fill(128) }),
  yieldControl: async () => { await new Promise<void>(resolve => setTimeout(resolve, 0)); }
});
await task.run();
const jpeg = task.takeOutput();
if (jpeg.bytes.length === 0 || jpeg.width !== 8 || createSrgbIccProfile().length === 0) throw new Error('Control failed');
```
