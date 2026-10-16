// SPDX-License-Identifier: Apache-2.0

/**
 * Module boundary and integration notes.
 * Pack validated unsigned integer tag values into little-endian BYTE, SHORT or LONG payloads; reject
 * values outside the selected storage range.
 * Describe an internal BYTE/UNDEFINED tag using the supplied byte array. The payload is borrowed here;
 * the final TIFF packer copies it into its owned output buffer.
 * @see docs/SIMULATED_CAPTURE.md for equations, coordinate/unit conventions, blockers and support
 * limits.
 */

import { InvalidConfigurationError } from "../core/configuration-error.js";

/** Internal TIFF field packing; pointers are resolved only inside the returned owned buffer. */
export interface ExportTiffTag { id: number; type: number; count: number; data: Uint8Array; pointer?: "exif" | "pixels" }
/**
 * Pack validated unsigned integer tag values into little-endian BYTE, SHORT or LONG payloads; reject
 * values outside the selected storage range.
 * @param id - number. See the linked contract for coordinate, unit and profile binding semantics.
 * @param type - 1 | 3 | 4. See the linked contract for coordinate, unit and profile binding semantics.
 * @param values - readonly number[]. See the linked contract for coordinate, unit and profile binding semantics.
 * @returns ExportTiffTag. Return shape and scientific status are explicit; no calibration is inferred from successful execution.
 *
 * @see docs/API_REFERENCE.md for the root export and exact type graph.
 */
export function exportTiffNumbers(id: number, type: 1 | 3 | 4, values: readonly number[]): ExportTiffTag {
  const size = type === 1 ? 1 : type === 3 ? 2 : 4, data = new Uint8Array(values.length*size), view = new DataView(data.buffer);
  values.forEach((v, i) => {
    if (!Number.isSafeInteger(v) || v < 0 || v > (type === 1 ? 255 : type === 3 ? 65535 : 4294967295)) throw new InvalidConfigurationError("TIFF integer is out of range.");
    if (size === 1) view.setUint8(i, v); else if (size === 2) view.setUint16(i*size, v, true); else view.setUint32(i*size, v, true);
  });
  return { id, type, count: values.length, data };
}
/**
 * Describe an internal BYTE/UNDEFINED tag using the supplied byte array. The payload is borrowed here;
 * the final TIFF packer copies it into its owned output buffer.
 * @param id - number. See the linked contract for coordinate, unit and profile binding semantics.
 * @param type - 1 | 7. See the linked contract for coordinate, unit and profile binding semantics.
 * @param data - Uint8Array. See the linked contract for coordinate, unit and profile binding semantics.
 * @returns ExportTiffTag. Return shape and scientific status are explicit; no calibration is inferred from successful execution.
 *
 * @see docs/API_REFERENCE.md for the root export and exact type graph.
 */
export function exportTiffBytes(id: number, type: 1 | 7, data: Uint8Array): ExportTiffTag {
  return { id, type, count: data.length, data };
}
/**
 * Encode printable ASCII with the required NUL terminator; reject unsupported characters instead of
 * silent lossy replacement.
 * @param id - number. See the linked contract for coordinate, unit and profile binding semantics.
 * @param value - string. See the linked contract for coordinate, unit and profile binding semantics.
 * @returns ExportTiffTag. Return shape and scientific status are explicit; no calibration is inferred from successful execution.
 *
 * @see docs/API_REFERENCE.md for the root export and exact type graph.
 */
export function exportTiffAscii(id: number, value: string): ExportTiffTag {
  if (!/^[\x20-\x7e]*$/.test(value)) throw new InvalidConfigurationError("TIFF text requires printable ASCII.");
  const data = new TextEncoder().encode(value+"\0"); return { id, type: 2, count: data.length, data };
}
/** Bounded rational approximation; matrix/metadata precision is explicit, never silent overflow. */
export function exportTiffRationals(id: number, signed: boolean, values: readonly number[]): ExportTiffTag {
  const data = new Uint8Array(values.length*8), view = new DataView(data.buffer);
  values.forEach((v, i) => {
    const limit = signed ? 2147483647 : 4294967295;
    const denominator = Math.min(1000000000, 10**Math.floor(Math.log10(limit/Math.max(1,Math.abs(v))))), numerator = Math.round(v*denominator);
    if (!Number.isFinite(v) || denominator < 1 || (!signed && v < 0) || Math.abs(numerator) > limit ||
        (v !== 0 && numerator === 0)) throw new InvalidConfigurationError("TIFF rational exceeds supported precision/range.");
    if (signed) view.setInt32(i*8, numerator, true); else view.setUint32(i*8, numerator, true);
    view.setUint32(i*8+4, denominator, true);
  });
  return { id, type: signed ? 10 : 5, count: values.length, data };
}
/**
 * IFD0 tags that Exif 2.32 (CIPA DC-008-2019, Table 17, "Compressed" column) marks J (carried by the JPEG
 * markers) or N (not allowed) for a JPEG-compressed primary image.
 */
const JPEG_EXIF_FORBIDDEN_IFD0 = new Set([256, 257, 258, 259, 262, 273, 277, 278, 279, 284, 513, 514, 530]);
/** Pixel dimensions that the compressed primary image's Exif IFD must record (PixelX/YDimension). */
export interface ExportJpegExifDimensions { pixelWidth: number; pixelHeight: number }
/**
 * Pack the Exif APP1 TIFF structure of a JPEG-compressed primary image with every tag that Exif 2.32
 * (CIPA DC-008-2019 §4.6.8, Tables 17 and 18, "Compressed" column) marks mandatory. Caller tags win; a
 * missing mandatory tag gets the standard's own default:
 *
 * - IFD0 XResolution = YResolution = 72/1 and ResolutionUnit = 2 (inches). The standard says "When the image
 *   resolution is unknown, 72 [dpi] shall be designated"; this is the Exif convention for an unknown
 *   resolution, not a physical print-size claim. The three tags are written together or not at all.
 * - IFD0 YCbCrPositioning = 1 (centered, the TIFF default; the baseline encoder codes 4:4:4, so no chroma
 *   siting is implied).
 * - Exif ExifVersion "0232", FlashpixVersion "0100", ComponentsConfiguration 1 2 3 0 (Y Cb Cr),
 *   PixelXDimension/PixelYDimension = the coded image size.
 *
 * ColorSpace (40961) is mandatory but has no default, so the caller must supply it. Tags the standard marks
 * J or N for compressed data (ImageWidth, Compression, StripOffsets, YCbCrSubSampling, ...) are rejected,
 * and a caller PixelX/YDimension that disagrees with the coded size is rejected.
 */
export function packExportJpegExif(main: readonly ExportTiffTag[], exif: readonly ExportTiffTag[], dimensions: ExportJpegExifDimensions): Uint8Array {
  const { pixelWidth, pixelHeight } = dimensions;
  if (![pixelWidth, pixelHeight].every((v) => Number.isSafeInteger(v) && v >= 1 && v <= 65535)) throw new InvalidConfigurationError("Exif pixel dimensions require integers from 1 to 65535.");
  if (main.some((t) => JPEG_EXIF_FORBIDDEN_IFD0.has(t.id) || t.id === 34665)) throw new InvalidConfigurationError("Exif IFD0 tag is not allowed for a JPEG-compressed primary image.");
  const mainIds = new Set(main.map((t) => t.id)), exifIds = new Set(exif.map((t) => t.id));
  const resolution = [282, 283, 296].filter((id) => mainIds.has(id)).length;
  if (resolution !== 0 && resolution !== 3) throw new InvalidConfigurationError("Exif XResolution, YResolution and ResolutionUnit must be written together.");
  if (!exifIds.has(40961)) throw new InvalidConfigurationError("Exif ColorSpace is mandatory and has no default.");
  for (const [id, value] of [[40962, pixelWidth], [40963, pixelHeight]] as const) {
    const tag = exif.find((t) => t.id === id);
    if (tag && (tag.count !== 1 || (tag.type === 3 ? new DataView(tag.data.buffer, tag.data.byteOffset).getUint16(0, true) : tag.type === 4 ? new DataView(tag.data.buffer, tag.data.byteOffset).getUint32(0, true) : -1) !== value)) {
      throw new InvalidConfigurationError("Exif PixelX/YDimension must equal the coded JPEG size.");
    }
  }
  const mainDefaults: ExportTiffTag[] = [
    ...(resolution === 0 ? [exportTiffRationals(282, false, [72]), exportTiffRationals(283, false, [72]), exportTiffNumbers(296, 3, [2])] : []),
    ...(mainIds.has(531) ? [] : [exportTiffNumbers(531, 3, [1])])
  ];
  const exifDefaults: ExportTiffTag[] = [
    ...(exifIds.has(36864) ? [] : [exportTiffBytes(36864, 7, new TextEncoder().encode("0232"))]),
    ...(exifIds.has(37121) ? [] : [exportTiffBytes(37121, 7, Uint8Array.of(1, 2, 3, 0))]),
    ...(exifIds.has(40960) ? [] : [exportTiffBytes(40960, 7, new TextEncoder().encode("0100"))]),
    ...(exifIds.has(40962) ? [] : [exportTiffNumbers(40962, 4, [pixelWidth])]),
    ...(exifIds.has(40963) ? [] : [exportTiffNumbers(40963, 4, [pixelHeight])])
  ];
  return packExportTiff([...main, ...mainDefaults], [...exif, ...exifDefaults]);
}
/** Independently authored little-endian TIFF6 IFD0 + EXIF IFD, with optional uncompressed strip. */
export function packExportTiff(main: readonly ExportTiffTag[], exif: readonly ExportTiffTag[], pixels = new Uint8Array()): Uint8Array {
  const pointer: ExportTiffTag = { ...exportTiffNumbers(34665, 4, [0]), pointer: "exif" };
  const lists = [[...main, pointer].sort((a,b) => a.id-b.id), [...exif].sort((a,b) => a.id-b.id)];
  for (const tags of lists) {
    if (tags.length > 128 || new Set(tags.map((t) => t.id)).size !== tags.length) throw new InvalidConfigurationError("Duplicate/oversized TIFF directory.");
  }
/**
 * Directories precede their out-of-line payloads. Four-byte alignment applies to
 * payload addresses; values up to four bytes stay in the directory slot. Pointer
 * placeholders are resolved only against this newly owned buffer, preventing a
 * caller-supplied address from becoming an external file/memory reference.
 */
  const exifOffset = 8+2+lists[0]!.length*12+4;
  let cursor = exifOffset+2+lists[1]!.length*12+4;
  const offsets = new Map<ExportTiffTag, number>();
  for (const tags of lists) for (const t of tags) {
    if (t.data.length > 4) { cursor = (cursor+3)&~3; offsets.set(t,cursor); cursor += t.data.length; }
  }
  const pixelOffset = (cursor+3)&~3, result = new Uint8Array(pixelOffset+pixels.length), view = new DataView(result.buffer);
  result.set([73,73,42,0,8,0,0,0]);
  lists.forEach((tags, directory) => {
    const base = directory === 0 ? 8 : exifOffset; view.setUint16(base,tags.length,true);
    tags.forEach((t,i) => {
      const p = base+2+i*12; view.setUint16(p,t.id,true); view.setUint16(p+2,t.type,true); view.setUint32(p+4,t.count,true);
      if (t.pointer) view.setUint32(p+8,t.pointer === "exif" ? exifOffset : pixelOffset,true);
      else if (t.data.length <= 4) result.set(t.data,p+8);
      else { view.setUint32(p+8,offsets.get(t)!,true); result.set(t.data,offsets.get(t)!); }
    });
  });
  result.set(pixels,pixelOffset); return result;
}
