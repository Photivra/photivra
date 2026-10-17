# DNG import and PNG output

This page covers two file-format tools added in engine 2.0.0:

- `parseDngRawImage` reads a DNG or TIFF-EP raw file and returns its stored raw codes plus the metadata the RAW development path needs.
- `serializePngImage` writes 8- or 16-bit RGB PNG files with explicit colour signalling, including wide-gamut (Display P3, BT.2020) encodings. The BT.2100 PQ and HLG transfer code points are not offered in 2.0 (their patent holders offer only licence-on-request declarations; see the patent review in `THIRD_PARTY.md`).

Both are browser-safe: they work on `Uint8Array`/`Uint16Array` data, do no file or network IO, and add no dependency. Both were written from the published specifications listed under [Sources](#sources); no third-party reader, decoder or encoder source was used.

## DNG import

```ts
import { parseDngRawImage } from '@photivra/engine';

// `fileBytes` holds the DNG file the caller read (from fetch, a file input or the file system).
export function readDng(fileBytes: Uint8Array) {
  const dng = parseDngRawImage({ bytes: fileBytes, maximumPixels: 64_000_000 });
  // dng.codes: Uint16Array, row-major, width x height x samplesPerPixel stored raw codes
  // dng.cfa: { repeatRows, repeatColumns, pattern, planeColors } with its origin at the active-area top-left
  // dng.blackLevel / dng.whiteLevel / dng.activeArea / dng.defaultCrop / dng.colorMatrix1 / dng.asShotNeutral ...
  return dng;
}
```

### What it returns

| Field | Meaning |
| --- | --- |
| `codes` | Stored raw codes in stored (not oriented) order. Nothing is applied: no linearization, black subtraction, scaling, white balance or demosaicing. |
| `cfa` | CFARepeatPatternDim and CFAPattern as plane indices into `planeColors` (CFAPlaneColor; 0 red, 1 green, 2 blue). The pattern's origin is the top-left corner of `activeArea`, as the DNG specification defines. `null` for LinearRaw. |
| `blackLevel` | BlackLevel in row-column-sample order with its repeat size, plus BlackLevelDeltaH/V when present. Origin: active-area top-left. Values may be fractional (RATIONAL). |
| `whiteLevel` | WhiteLevel per sample; default 2^BitsPerSample − 1. |
| `activeArea`, `defaultCrop` | ActiveArea as a rectangle; DefaultCropOrigin/Size relative to the active-area origin (may be fractional). |
| `colorMatrix1/2` | ColorMatrix1/2 (XYZ → camera reference space), row-major, or `null`. |
| `asShotNeutral`, `calibrationIlluminant1/2` | As stored; illuminants use Exif LightSource codes. |
| `linearizationTable` | Returned when present, never applied to `codes`. |
| `orientation`, `make`, `model`, `uniqueCameraModel`, `dngVersion`, `rawDataUniqueId` | As stored. `dngVersion` is `null` for a TIFF-EP file. |

To feed the engine's development path, a caller subtracts the black level per CFA phase, divides by `whiteLevel − black`, and uses `colorMatrix1` (camera ← XYZ) or its inverse as the sensor colour profile. The engine's own `ExportSensorColorProfile.normalizedCameraChannelsToXyz` is the inverse of the matrix the engine writes as ColorMatrix1.

### Supported files

- Classic TIFF in either byte order (`II` or `MM`). BigTIFF is rejected.
- The primary image is the first IFD, in IFD-chain then SubIFD order, with NewSubFileType 0 and PhotometricInterpretation 32803 (CFA) or 34892 (LinearRaw). DNG preview IFDs are skipped.
- Compression 1 (uncompressed) and 7 (lossless Huffman JPEG), in strips or tiles, chunky planar configuration, unsigned integer samples of 8 to 16 bits.
- Uncompressed packing follows the DNG BitsPerSample rule: 8-bit samples are bytes, 16-bit samples use the file byte order, and other depths (10, 12, 14 ...) are packed MSB-first ("FillOrder 1, big-endian, even if the TIFF file itself uses little-endian byte order") with each row starting on a byte boundary.
- Lossless JPEG follows ITU-T T.81 Annex H: one SOF3 frame, precision 2–16, 1–4 components with 1×1 sampling, one interleaved scan, predictors 1–7, point transform, DRI restart intervals of whole lines and 0xFF00 stuffing. As the DNG specification allows, the JPEG frame may have a different width, height and component count from the tile as long as the total sample count matches (CFA tiles are commonly coded as half-width two-component frames). For DNGVersion below 1.1.0.0 the reader applies the specification's "Compatibility Issue 2" (16 extra bits after the 16-bit difference category).
- CFALayout 1 (rectangular) only.

Not supported, and rejected with `InvalidConfigurationError`: Deflate (8), lossy JPEG (34892) and JPEG XL (52546) raw data, floating-point samples, planar configuration 2, more than 16 bits per sample, staggered CFA layouts, multi-scan or subsampled lossless JPEG. Opcode lists, camera profiles beyond ColorMatrix1/2, ForwardMatrix, NoiseProfile and maker notes are not returned.

### Untrusted input

The reader treats every file as hostile:

- Every IFD offset, tag value extent, strip/tile offset and byte count is checked against the buffer before it is read.
- IFD chains and SubIFDs are walked with a visited set: a loop or two IFDs at one offset fail. The total IFD count is capped (`maximumIfds`, default 64, at most 1024) and SubIFD nesting is limited to three levels.
- Duplicate tags in one IFD, zero rational denominators, non-finite values and tag arrays longer than their defined size fail.
- `width × height` is checked against `maximumPixels` (default 64 000 000, at most 200 000 000) before any image allocation; tiles are also capped. A lossless JPEG frame header is checked against the strip or tile's sample count before its output is allocated, so a small stream cannot declare a huge frame (decompression bomb).
- Truncated entropy data, invalid Huffman codes, over-subscribed Huffman tables, missing restart markers and reconstructed samples above the declared precision or BitsPerSample fail.

`test/dng-import.test.ts` covers engine-exported DNG round trips (identical codes, CFA, black and white levels, active area, matrices, neutral, orientation and RawDataUniqueID), uncompressed 8/10/12/14/16-bit strips and tiles in both byte orders, lossless JPEG tiles for all seven predictors with restarts and point transform, the 16-bit difference special case, SubIFD discovery, and a fixed-seed mutation fuzz (3000 corrupted and truncated files) in which every outcome is either a decoded image or an `InvalidConfigurationError`. The lossless JPEG streams in these tests come from a separate test-only encoder; no real-camera DNG corpus is committed, so interoperability with specific camera files is not claimed.

## PNG output

```ts
import { serializePngImage } from '@photivra/engine';

// Two pixels of 16-bit linear BT.2020 RGB (code values already scaled by the caller).
const png = serializePngImage({
  width: 2, height: 1, bitDepth: 16,
  samples: Uint16Array.of(32768, 30000, 28000, 65535, 65535, 65535),
  colourEncoding: { kind: 'cicp', primaries: 'bt2020', transfer: 'linear', fullRange: true },
  masteringDisplay: { redXy: [0.708, 0.292], greenXy: [0.17, 0.797], blueXy: [0.131, 0.046], whiteXy: [0.3127, 0.329],
    maximumLuminanceCdPerSquareMeter: 1000, minimumLuminanceCdPerSquareMeter: 0.0001 },
  contentLightLevel: { maximumContentLightLevelCdPerSquareMeter: 1000, maximumFrameAverageLightLevelCdPerSquareMeter: 200 }
});
if (png[1] !== 0x50) throw new Error('not a PNG');
```

The encoder writes the caller's integer code values unchanged. Converting linear light to an encoded signal (for example sRGB), choosing primaries and mapping out-of-gamut colours are the caller's job; the colorimetry module provides those transfer functions and primaries.

### Colour signalling

`colourEncoding` is required and is exactly one of:

| `kind` | Chunks written | Meaning |
| --- | --- | --- |
| `srgb` | `sRGB` (rendering intent) + `gAMA` 45455 + `cHRM` | The sRGB chunk, with the gAMA/cHRM values the PNG specification lists as the only ones allowed beside it, for older decoders. |
| `icc` | `iCCP` | A caller-supplied ICC profile (header size must equal its length), zlib-compressed. The profile name is 1–79 Latin-1 characters. |
| `cicp` | `cICP` | ITU-T H.273 code points. PNG permits only MatrixCoefficients 0 (RGB). |

cICP code points (H.273; matching the PNG specification's examples):

| Option | Code | Standard |
| --- | --- | --- |
| `primaries: 'bt709'` | 1 | ITU-R BT.709 (same primaries as sRGB) |
| `primaries: 'display-p3'` | 12 | P3 primaries, D65 white (W3C CSS Color 4 `display-p3`; also SMPTE EG 432-1) |
| `primaries: 'bt2020'` | 9 | ITU-R BT.2020 |
| `transfer: 'bt709'` | 1 | ITU-R BT.709 |
| `transfer: 'linear'` | 8 | Linear |
| `transfer: 'srgb'` | 13 | sRGB (W3C CSS Color 4; also IEC 61966-2-1) |

So Display P3 is `{ primaries: 'display-p3', transfer: 'srgb', fullRange: true }` (cICP `0C 0D 00 01`) and linear BT.2020 is `09 08 00 01`.

Static display metadata is written only with `cicp`, as the PNG specification requires a cICP chunk alongside mDCV. It stays available without PQ and HLG: the PNG Third Edition (§11.3.2.7) says mDCV "may also be included with HLG and SDR image formats (for example ITU-R BT.709)", and both chunks are caller-supplied descriptions, not a transfer function:

- `masteringDisplay` → `mDCV` (W3C PNG Third Edition; also SMPTE ST 2086): R, G, B and white CIE 1931 xy chromaticities stored in units of 0.00002, maximum and minimum luminance in units of 0.0001 cd/m².
- `contentLightLevel` → `cLLI` (W3C PNG Third Edition; also CTA-861.3): MaxCLL and MaxFALL in units of 0.0001 cd/m²; 0 means unknown. MaxFALL above a known MaxCLL is rejected.

The engine does not compute MaxCLL/MaxFALL or mastering metadata; the caller supplies them.

Each `colourEncoding` kind accepts only its own fields (`srgb`: `kind`, `renderingIntent`; `icc`: `kind`, `profileName`, `profile`; `cicp`: `kind`, `primaries`, `transfer`, `fullRange`), and `masteringDisplay` and `contentLightLevel` accept only their documented fields. Code-point names are looked up in maps, so a name such as `"constructor"` or `"toString"` is rejected instead of reaching `Object.prototype`.

### Pixels and compression

- Colour type 2 (truecolour), bit depth 8 (`Uint8Array`) or 16 (`Uint16Array`, written big-endian), no interlacing, at most 65535 pixels per side and 100 000 000 pixels.
- Filtering: one PNG filter type for every row (`none`, `sub`, `up`, `average`, `paeth`) or `adaptive` (default), the specification's suggested heuristic: per row, the type with the minimum sum of absolute signed filtered bytes (ties go to the lower type).
- Compression: zlib (RFC 1950) holding either stored DEFLATE blocks or one fixed-Huffman block (RFC 1951) with a greedy LZ77 matcher (3-byte hash, 32 KiB window, at most 64 chain probes). This is a deterministic, modest compressor, not a size-optimal one. Output bytes depend only on the input; a platform `CompressionStream` is deliberately not used, because its output is not specified byte for byte. IDAT is split into 1 MiB chunks. The fixed-Huffman codes are precomputed bit-reversed, the LZ77 hash rolls from byte to byte, and each filter type has its own loop; `test/png-encoder.test.ts` pins a SHA-256 over every filter and compression mode, so these speed-ups keep the output bytes unchanged.

`test/png-encoder.test.ts` decodes every output with Node's zlib and an independent reconstruction-filter implementation, checks every chunk CRC, and requires exact 8- and 16-bit round trips for all filters and both compression modes. It checks cICP, mDCV and cLLI bytes against the PNG specification's worked examples, and that `pq` and `hlg` are rejected. During development the outputs were also opened with Pillow 12.3.0: every file decoded, 8-bit pixels matched exactly, and 16-bit files (which Pillow reduces to 8-bit RGB) matched the high byte of every sample. Pillow does not interpret cICP, mDCV or cLLI, so their display behaviour was not verified in a viewer.

### Not provided: AVIF and HEIC

AVIF and HEIC still images are AV1 and HEVC intra frames inside an ISO-BMFF (HEIF) container. Writing them needs a full AV1 or HEVC encoder (transforms, intra prediction, entropy coding and, for HEVC, patent-licensed technology). That is far outside a dependency-free scientific engine, and pulling in a codec would add a large native or WebAssembly dependency with its own licence review. PNG with cICP carries wide-gamut signalling losslessly; a host application that needs AVIF or HEIC can transcode the PNG or the 16-bit samples with a platform or third-party encoder.

## Sources

- Adobe, *Digital Negative (DNG) Specification*, version 1.7.1.0, September 2023 — tag definitions, BitsPerSample packing, lossless JPEG use, ActiveArea/CFA/BlackLevel origin, Compatibility Issue 2.
- Adobe, *TIFF Revision 6.0*, 1992 — file structure, IFDs, field types, strips and tiles.
- CIPA DC-008 (Exif 2.32 / 3.0), free at <https://www.cipa.jp/e/std/std-sec.html> — CFAPattern; the DNG specification above defines CFARepeatPatternDim/CFAPattern use and origin. The TIFF/EP tags are also specified in ISO 12234-2.
- ITU-T Recommendation T.81 (1992), free at <https://www.w3.org/Graphics/JPEG/itu-t81.pdf> (identical text: ISO/IEC 10918-1), Annex H (lossless processes), Annex C and F.2.2.3 (Huffman tables and decoding), F.1.2.3 (restart).
- W3C, *Portable Network Graphics (PNG) Specification (Third Edition)*, W3C Recommendation 24 June 2025 — chunks, filters, cICP, mDCV, cLLI, sRGB gAMA/cHRM values.
- IETF RFC 1950 (zlib) and RFC 1951 (DEFLATE).
- ITU-T Recommendation H.273 — colour primaries and transfer characteristics code points.
- ITU-R BT.2020; ITU-T H.265 Annex D (mastering display colour volume and content light level SEI semantics); W3C CSS Color 4 `display-p3` (P3 primaries) — meaning of the signalled values, all free. Also specified in SMPTE ST 2086, CTA-861.3 and SMPTE EG 432-1.

Only factual identifiers (tag numbers, code points, chunk layouts, fixed values) are taken from these standards.
