// SPDX-License-Identifier: Apache-2.0

import { InvalidConfigurationError } from "../core/configuration-error.js";

/** Internal TIFF field packing; pointers are resolved only inside the returned owned buffer. */
export interface ExportTiffTag { id: number; type: number; count: number; data: Uint8Array; pointer?: "exif" | "pixels" }
export function exportTiffNumbers(id: number, type: 1 | 3 | 4, values: readonly number[]): ExportTiffTag {
  const size = type === 1 ? 1 : type === 3 ? 2 : 4, data = new Uint8Array(values.length*size), view = new DataView(data.buffer);
  values.forEach((v, i) => {
    if (!Number.isSafeInteger(v) || v < 0 || v > (type === 1 ? 255 : type === 3 ? 65535 : 4294967295)) throw new InvalidConfigurationError("TIFF integer is out of range.");
    if (size === 1) view.setUint8(i, v); else if (size === 2) view.setUint16(i*size, v, true); else view.setUint32(i*size, v, true);
  });
  return { id, type, count: values.length, data };
}
export function exportTiffBytes(id: number, type: 1 | 7, data: Uint8Array): ExportTiffTag {
  return { id, type, count: data.length, data };
}
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
/** Independently authored little-endian TIFF6 IFD0 + EXIF IFD, with optional uncompressed strip. */
export function packExportTiff(main: readonly ExportTiffTag[], exif: readonly ExportTiffTag[], pixels = new Uint8Array()): Uint8Array {
  const pointer: ExportTiffTag = { ...exportTiffNumbers(34665, 4, [0]), pointer: "exif" };
  const lists = [[...main, pointer].sort((a,b) => a.id-b.id), [...exif].sort((a,b) => a.id-b.id)];
  for (const tags of lists) {
    if (tags.length > 128 || new Set(tags.map((t) => t.id)).size !== tags.length) throw new InvalidConfigurationError("Duplicate/oversized TIFF directory.");
  }
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
