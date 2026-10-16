// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from "vitest";
import { createExportJpegEncoder, roundJpegCoefficient, JPEG_DCT_COSINES, EXPORT_JPEG_ENCODER_ID } from "../src/capture/export-jpeg.js";
import { packExportJpegExif, exportTiffNumbers, exportTiffAscii, exportTiffBytes } from "../src/capture/export-tiff.js";
import { createLegacyExportJpegEncoder } from "./helpers/legacy-export-jpeg.js";
import { InvalidConfigurationError } from "../src/index.js";

describe("baseline JPEG encoder version 2", () => {
  it("uses correctly rounded DCT cosines: exact symmetries hold and every entry is within 1 ulp of Math.cos", () => {
    expect(EXPORT_JPEG_ENCODER_ID).toBe("photivra-baseline-jpeg-444-v2");
    expect(JPEG_DCT_COSINES.length).toBe(64);
    for (let u = 0; u < 8; u++) for (let x = 0; x < 8; x++) {
      const c = JPEG_DCT_COSINES[u * 8 + x]!;
      // cos((2(7-x)+1)uπ/16) = (-1)^u cos((2x+1)uπ/16) exactly; the correctly rounded table preserves it bit for bit.
      expect(JPEG_DCT_COSINES[u * 8 + 7 - x]).toBe(u % 2 ? -c : c);
      // Runtime libm values differ from the true cosine only in the last bits of the rounded argument.
      expect(Math.abs(c - Math.cos((2 * x + 1) * u * Math.PI / 16))).toBeLessThanOrEqual(8 * Number.EPSILON);
    }
    // Values that are exactly representable or classical constants.
    expect(JPEG_DCT_COSINES[0]).toBe(1); expect(JPEG_DCT_COSINES[32]).toBe(Math.SQRT1_2);
    // Every distinct magnitude, independently known to 20 digits: cos(kπ/16), k = 1, 2, 3, 5, 6, 7.
    const reference = ["0.98078528040323044913", "0.92387953251128675613", "0.83146961230254523708", "0.55557023301960222474", "0.38268343236508977173", "0.19509032201612826785"].map(Number);
    expect([JPEG_DCT_COSINES[8], JPEG_DCT_COSINES[16], JPEG_DCT_COSINES[9], JPEG_DCT_COSINES[10], JPEG_DCT_COSINES[17], JPEG_DCT_COSINES[11]]).toEqual(reference);
  });

  it("rounds quantized coefficients half away from zero", () => {
    expect([2.5, -2.5, .5, -.5, 1.5, -1.5, 0.49999999999999994, -0.49999999999999994, 3.2, -3.7].map(roundJpegCoefficient)).toEqual([3, -3, 1, -1, 2, -2, 0, -0, 3, -4]);
  });

  it("changes version-1 bytes where a coefficient was within an ulp of a half-integer (documented 2.0.0 change)", () => {
    // Spiky block at q = 3: the Cb (u=0, v=4) coefficient is mathematically -19.5. Runtime Math.cos on V8 gives
    // -19.499999999999996 (rounded to -19 in version 1); the correctly rounded table gives -19.500000000000004 (-20).
    const block = Array.from({ length: 192 }, (_, i) => [38, 44, 47, 63, 65, 107, 109, 177, 183].includes(i) ? 255 : 21);
    const encode = (factory: typeof createExportJpegEncoder): Uint8Array => {
      const e = factory({ width: 8, height: 8, quantizationStep: 3, maximumOutputBytes: 4096, exif: new Uint8Array(), xmp: new Uint8Array() });
      e.writeRgbBlock(block); return e.finish();
    };
    expect(encode(createExportJpegEncoder)).not.toEqual(encode(createLegacyExportJpegEncoder));
  });

  it("grows its output buffer instead of allocating the whole budget and keeps the exact budget limit", () => {
    const options = { width: 8, height: 8, quantizationStep: 4, exif: new Uint8Array(), xmp: new Uint8Array() };
    const big = createExportJpegEncoder({ ...options, maximumOutputBytes: 256_000_000 });
    big.writeRgbBlock(Array(192).fill(128));
    const bytes = big.finish();
    const exact = createExportJpegEncoder({ ...options, maximumOutputBytes: bytes.length });
    exact.writeRgbBlock(Array(192).fill(128));
    expect(exact.finish()).toEqual(bytes);
    const short = createExportJpegEncoder({ ...options, maximumOutputBytes: bytes.length - 1 });
    short.writeRgbBlock(Array(192).fill(128));
    expect(() => short.finish()).toThrow(InvalidConfigurationError);
    // Growth across many doublings: 512 x 512 noise at q = 1 exceeds the 64 KiB initial capacity.
    let s = 1; const next = (): number => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) >>> 24;
    const large = createExportJpegEncoder({ ...options, width: 512, height: 512, quantizationStep: 1, maximumOutputBytes: 10_000_000 });
    for (let b = 0; b < 64 * 64; b++) large.writeRgbBlock(Array.from({ length: 192 }, next));
    expect(large.finish().length).toBeGreaterThan(65_536 * 4);
  });
});

describe("Exif 2.32 completion for JPEG-compressed primary images", () => {
  it("adds every missing mandatory tag with the standard defaults and keeps caller values", () => {
    const ifd = (bytes: Uint8Array, offset: number): number[] => {
      const v = new DataView(bytes.buffer, bytes.byteOffset); return Array.from({ length: v.getUint16(offset, true) }, (_, i) => v.getUint16(offset + 2 + i * 12, true));
    };
    const tiff = packExportJpegExif([exportTiffNumbers(274, 3, [1])], [exportTiffNumbers(40961, 3, [65535])], { pixelWidth: 640, pixelHeight: 480 });
    const view = new DataView(tiff.buffer), main = ifd(tiff, 8);
    expect(main).toEqual([274, 282, 283, 296, 531, 34665]);
    const exifOffset = view.getUint32(8 + 2 + 5 * 12 + 8, true);
    expect(ifd(tiff, exifOffset)).toEqual([36864, 37121, 40960, 40961, 40962, 40963]);
    // Caller-supplied resolution and positioning are kept, not duplicated.
    const custom = packExportJpegExif([exportTiffNumbers(296, 3, [3]), exportTiffNumbers(282, 3, [118]), exportTiffNumbers(283, 3, [118]), exportTiffNumbers(531, 3, [2])],
      [exportTiffNumbers(40961, 3, [1]), exportTiffBytes(36864, 7, new TextEncoder().encode("0232")), exportTiffNumbers(40962, 4, [8])], { pixelWidth: 8, pixelHeight: 8 });
    expect(ifd(custom, 8)).toEqual([282, 283, 296, 531, 34665]);
  });

  it("rejects missing ColorSpace, partial resolution, J/N tags and inconsistent pixel dimensions", () => {
    const dims = { pixelWidth: 16, pixelHeight: 8 }, cs = exportTiffNumbers(40961, 3, [1]);
    expect(() => packExportJpegExif([], [], dims)).toThrow(InvalidConfigurationError);
    expect(() => packExportJpegExif([exportTiffNumbers(296, 3, [2])], [cs], dims)).toThrow(InvalidConfigurationError);
    for (const id of [256, 257, 259, 273, 530]) expect(() => packExportJpegExif([exportTiffNumbers(id, 3, [1])], [cs], dims)).toThrow(InvalidConfigurationError);
    expect(() => packExportJpegExif([exportTiffAscii(305, "x")], [cs, exportTiffNumbers(40962, 4, [17])], dims)).toThrow(InvalidConfigurationError);
    expect(() => packExportJpegExif([], [cs], { pixelWidth: 0, pixelHeight: 8 })).toThrow(InvalidConfigurationError);
  });
});
