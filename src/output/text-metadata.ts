// SPDX-License-Identifier: Apache-2.0

/**
 * Optional caller-supplied text metadata for encoded images (2.4): a description, the creating software, a
 * copyright notice and a comment. The engine writes the caller's text unchanged and adds no text of its own
 * (in a DNG the description follows the existing simulated-RAW statement).
 * Independently written from these free specifications; no third-party source was used:
 *
 * - JPEG: the existing XMP packet in APP1 (Adobe XMP Specification Part 3, 2020, §1.1.3: identifier
 *   "http://ns.adobe.com/xap/1.0/" and a UTF-8 packet of at most 65 502 bytes, §1.1.3.1). The fields are added
 *   as one more top-level `rdf:Description` of the same resource (`rdf:about=""`): XMP Part 1 (2012, identical
 *   to ISO 16684-1:2011) §7.4 lets properties be "arbitrarily apportioned among the rdf:Description elements"
 *   of the single `rdf:RDF`. Mapping: `dc:description` and `dc:rights` as language alternatives with
 *   `x-default` (Part 1 §8.3), `xmp:CreatorTool` as text (Part 1 §8.4) and `exif:UserComment` as a language
 *   alternative (Part 2, 2022, §3.4, the Exif namespace). The comment is also a COM marker segment (ITU-T T.81
 *   §B.2.4.5, "the interpretation is left to the application"; written as UTF-8) after the APPn segments.
 * - PNG: one text chunk per field with the predefined keywords Description, Software, Copyright and Comment
 *   (W3C PNG Specification, Third Edition, §11.3.3.1, Table 21). `tEXt` (§11.3.3.2; printable Latin-1 plus line
 *   feed) when every character fits, otherwise an uncompressed `iTXt` (§11.3.3.4; UTF-8, empty language tag and
 *   translated keyword). The chunks go before the first IDAT, as §12.9 recommends for small text.
 * - DNG: `serializeNativeRawDng` writes the same XMP fields as a packet in TIFF tag 700 (XMP Part 3 §1.1.6,
 *   Table 13) plus the TIFF ASCII tags that XMP Part 3 §3.2.3 maps to them.
 *
 * Validation: each given field is a non-empty string of at most `OUTPUT_TEXT_METADATA_MAXIMUM_BYTES` UTF-8
 * bytes, with no unpaired UTF-16 surrogate (so it encodes to valid UTF-8 without replacement), no NUL or other
 * C0/C1 control character except line feed, and no U+FFFE/U+FFFF (not XML 1.0 characters). Line breaks are a
 * single line feed, as the PNG text chunks require.
 * Root exports (#388): `addJpegTextMetadata` and `addPngTextMetadata` add the text to a JPEG or PNG that the caller
 * encoded (for example a file assembled from `output.region` parts and `composePrintJpegStrips` or `serializePngImage`),
 * with the same bytes as `simulateCapture`'s `output.metadata`, which calls the same two functions.
 * @see docs/QUICK_START.md "Text metadata (2.4)".
 */

import { InvalidConfigurationError } from "../core/configuration-error.js";
import { pngCrc32 } from "./png-encoder.js";

/** Caller-supplied text written into JPEG, PNG and DNG outputs. Every field is optional; at least one must be set. */
export interface OutputTextMetadata {
  /** What the image shows. JPEG/DNG `dc:description`, PNG Description, DNG ImageDescription (appended when ASCII). */
  description?: string;
  /** Name and version of the caller's software. JPEG/DNG `xmp:CreatorTool`, PNG Software. */
  software?: string;
  /** Rights statement. JPEG/DNG `dc:rights`; the PNG keyword and DNG tag 33432 (when ASCII) of the same name. */
  copyright?: string;
  /** Free-text comment. JPEG COM segment and `exif:UserComment`, PNG Comment, DNG `exif:UserComment`. */
  comment?: string;
}

/** Largest UTF-8 length of one metadata field, in bytes. Four escaped fields still fit one JPEG APP1 segment. */
export const OUTPUT_TEXT_METADATA_MAXIMUM_BYTES = 2048;
const FIELDS = ["description", "software", "copyright", "comment"] as const;
type Field = typeof FIELDS[number];
/** PNG Third Edition §11.3.3.1 Table 21 keyword for each field: the field name with an initial capital. */
const pngKeyword = (field: Field): string => field[0]!.toUpperCase() + field.slice(1);
const XMP_IDENTIFIER = "http://ns.adobe.com/xap/1.0/\0";
/** Largest XMP packet in one JPEG APP1 segment (XMP Part 3 §1.1.3.1). */
const JPEG_XMP_MAXIMUM_PACKET_BYTES = 65502;
const encoder = new TextEncoder();

/**
 * Checks caller text metadata. Returns undefined when `value` is undefined, otherwise a frozen copy with only
 * the given fields. `path` prefixes the error messages, for example "output.metadata".
 */
export function parseOutputTextMetadata(value: unknown, path: string): Readonly<OutputTextMetadata> | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new InvalidConfigurationError(path + " must be an object.");
  const out: OutputTextMetadata = {};
  for (const key of Object.keys(value)) if (!(FIELDS as readonly string[]).includes(key)) throw new InvalidConfigurationError("Unknown " + path + " field: " + key + ".");
  for (const field of FIELDS) {
    const text = (value as Record<string, unknown>)[field];
    if (text === undefined) continue;
    const name = path + "." + field;
    if (typeof text !== "string" || text.length === 0) throw new InvalidConfigurationError(name + " must be a non-empty string.");
    if (/\p{Cs}/u.test(text)) throw new InvalidConfigurationError(name + " must be valid Unicode text (it has an unpaired UTF-16 surrogate).");
    if (text.includes("\0")) throw new InvalidConfigurationError(name + " must not contain NUL characters.");
    // eslint-disable-next-line no-control-regex
    if (/[\u0001-\u0009\u000b-\u001f\u007f-\u009f￾￿]/u.test(text)) throw new InvalidConfigurationError(name + " must not contain control characters other than line feed (\\n), or U+FFFE/U+FFFF.");
    const bytes = encoder.encode(text).length;
    if (bytes > OUTPUT_TEXT_METADATA_MAXIMUM_BYTES) throw new InvalidConfigurationError(name + " must be at most " + OUTPUT_TEXT_METADATA_MAXIMUM_BYTES + " UTF-8 bytes (it has " + bytes + ").");
    out[field] = text;
  }
  if (Object.keys(out).length === 0) throw new InvalidConfigurationError(path + " must set at least one of description, software, copyright or comment.");
  return Object.freeze(out);
}

function xmlText(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
const alt = (text: string): string => '<rdf:Alt><rdf:li xml:lang="x-default">' + xmlText(text) + "</rdf:li></rdf:Alt>";

/** One `rdf:Description` of the current resource with the given fields, declaring only the namespaces it uses. */
export function xmpTextMetadataDescription(metadata: Readonly<OutputTextMetadata>): string {
  const dc = metadata.description !== undefined || metadata.copyright !== undefined;
  return '<rdf:Description rdf:about=""' + (dc ? ' xmlns:dc="http://purl.org/dc/elements/1.1/"' : "") +
    (metadata.software !== undefined ? ' xmlns:xmp="http://ns.adobe.com/xap/1.0/"' : "") +
    (metadata.comment !== undefined ? ' xmlns:exif="http://ns.adobe.com/exif/1.0/"' : "") + ">" +
    (metadata.description !== undefined ? "<dc:description>" + alt(metadata.description) + "</dc:description>" : "") +
    (metadata.copyright !== undefined ? "<dc:rights>" + alt(metadata.copyright) + "</dc:rights>" : "") +
    (metadata.software !== undefined ? "<xmp:CreatorTool>" + xmlText(metadata.software) + "</xmp:CreatorTool>" : "") +
    (metadata.comment !== undefined ? "<exif:UserComment>" + alt(metadata.comment) + "</exif:UserComment>" : "") + "</rdf:Description>";
}

/** A complete XMP packet (`x:xmpmeta` wrapper, no `xpacket` processing instructions) holding only the text fields. */
export function xmpTextMetadataPacket(metadata: Readonly<OutputTextMetadata>): Uint8Array {
  return encoder.encode('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
    xmpTextMetadataDescription(metadata) + "</rdf:RDF></x:xmpmeta>");
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}
function segment(marker: number, payload: Uint8Array): Uint8Array {
  return concat([Uint8Array.of(0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 255), payload]);
}
function startsWith(bytes: Uint8Array, offset: number, prefix: Uint8Array): boolean {
  if (offset + prefix.length > bytes.length) return false;
  for (let i = 0; i < prefix.length; i++) if (bytes[offset + i] !== prefix[i]) return false;
  return true;
}

/** The checked metadata of a root writer: an object of the given fields, `metadata` in the messages. */
function requireTextMetadata(value: unknown, writer: string): Readonly<OutputTextMetadata> {
  if (value === undefined) throw new InvalidConfigurationError(writer + " metadata must be an object.");
  return parseOutputTextMetadata(value, writer + " metadata")!;
}

/**
 * Returns a copy of a baseline JPEG with the text fields added: merged into its XMP APP1 packet (or a new packet
 * after the last leading APPn segment when it has none), plus a COM segment for `comment`. Every other byte,
 * including the entropy-coded data, is unchanged. Reads marker segments only up to SOS. The engine's own
 * `output.metadata` path calls this function, so for the same JPEG and text the bytes are the same.
 *
 * Root export (#388). `metadata` is checked as `output.metadata` is (see the module notes); a JPEG without SOI,
 * a malformed or truncated segment before SOS, an XMP APP1 segment after a non-APPn segment, an XMP packet that is
 * not UTF-8 or has no `rdf:RDF`, or text that makes the packet larger than one APP1 segment fails with
 * `InvalidConfigurationError`. The input is not changed.
 * @param jpeg A baseline JPEG stream, for example `createPrintJpegTask`'s or `composePrintJpegStrips`'s bytes.
 * @param metadata The text: at least one of description, software, copyright and comment.
 * @returns A new array holding the JPEG with the text.
 */
export function addJpegTextMetadata(jpeg: Uint8Array, metadata: Readonly<OutputTextMetadata>): Uint8Array {
  if (!(jpeg instanceof Uint8Array)) throw new InvalidConfigurationError("addJpegTextMetadata jpeg must be a Uint8Array.");
  const text = requireTextMetadata(metadata, "addJpegTextMetadata");
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new InvalidConfigurationError("JPEG text metadata needs a JPEG stream starting with SOI.");
  const identifier = encoder.encode(XMP_IDENTIFIER);
  let offset = 2, xmp: { start: number; end: number } | undefined, appEnd = 2, inLeadingApps = true;
  for (;;) {
    if (offset + 4 > jpeg.length || jpeg[offset] !== 0xff) throw new InvalidConfigurationError("JPEG text metadata found a malformed marker segment.");
    const marker = jpeg[offset + 1]!;
    if (marker === 0xda) break;
    // Before SOS every marker has a length (T.81 B.1.1.4): SOI, EOI, RSTm, TEM and fill bytes there are malformed.
    const length = (jpeg[offset + 2]! << 8) | jpeg[offset + 3]!;
    if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9) || length < 2) throw new InvalidConfigurationError("JPEG text metadata found a malformed marker segment.");
    const end = offset + 2 + length;
    if (end > jpeg.length) throw new InvalidConfigurationError("JPEG text metadata found a truncated marker segment.");
    if (marker === 0xe1 && !xmp && startsWith(jpeg, offset + 4, identifier)) {
      // The packet is rewritten in place, so it must lie in the leading APPn run that the COM segment follows.
      if (!inLeadingApps) throw new InvalidConfigurationError("JPEG text metadata found an XMP APP1 segment after a non-APPn segment.");
      xmp = { start: offset, end };
    }
    if (inLeadingApps && marker >= 0xe0 && marker <= 0xef) appEnd = end; else inLeadingApps = false;
    offset = end;
  }
  const description = xmpTextMetadataDescription(text);
  let xmpPacket: Uint8Array;
  if (xmp) {
    let packet: string;
    try { packet = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(jpeg.subarray(xmp.start + 4 + identifier.length, xmp.end)); }
    catch { throw new InvalidConfigurationError("JPEG text metadata found an XMP packet that is not valid UTF-8."); }
    const close = packet.lastIndexOf("</rdf:RDF>");
    if (close < 0) throw new InvalidConfigurationError("JPEG text metadata found an XMP packet without rdf:RDF.");
    xmpPacket = encoder.encode(packet.slice(0, close) + description + packet.slice(close));
  } else xmpPacket = xmpTextMetadataPacket(text);
  if (xmpPacket.length > JPEG_XMP_MAXIMUM_PACKET_BYTES) throw new InvalidConfigurationError("The text metadata makes the JPEG XMP packet " + xmpPacket.length + " bytes; one APP1 segment holds at most " + JPEG_XMP_MAXIMUM_PACKET_BYTES + ".");
  const xmpSegment = segment(0xe1, concat([identifier, xmpPacket]));
  const com = text.comment === undefined ? new Uint8Array(0) : segment(0xfe, encoder.encode(text.comment));
  if (xmp) return concat([jpeg.subarray(0, xmp.start), xmpSegment, jpeg.subarray(xmp.end, appEnd), com, jpeg.subarray(appEnd)]);
  return concat([jpeg.subarray(0, appEnd), xmpSegment, com, jpeg.subarray(appEnd)]);
}

function latin1Text(text: string): boolean {
  for (const ch of text) { const c = ch.codePointAt(0)!; if (!(c === 10 || (c >= 0x20 && c <= 0x7e) || (c >= 0xa1 && c <= 0xff))) return false; }
  return true;
}
function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length), view = new DataView(out.buffer), typeBytes = Uint8Array.from(type, (c) => c.charCodeAt(0));
  view.setUint32(0, data.length); out.set(typeBytes, 4); out.set(data, 8); view.setUint32(8 + data.length, pngCrc32(data, pngCrc32(typeBytes)));
  return out;
}
/** The text chunks for the given fields, in the order description, software, copyright, comment. */
export function pngTextMetadataChunks(metadata: Readonly<OutputTextMetadata>): Uint8Array[] {
  return FIELDS.filter((field) => metadata[field] !== undefined).map((field) => {
    const keyword = Uint8Array.from(pngKeyword(field), (c) => c.charCodeAt(0)), text = metadata[field]!;
    // tEXt: keyword, NUL, Latin-1 text. iTXt: keyword, NUL, compression flag 0, method 0, empty language tag, NUL, empty translated keyword, NUL, UTF-8 text.
    return latin1Text(text) ? pngChunk("tEXt", concat([keyword, Uint8Array.of(0), Uint8Array.from(text, (c) => c.charCodeAt(0))]))
      : pngChunk("iTXt", concat([keyword, Uint8Array.of(0, 0, 0, 0, 0), encoder.encode(text)]));
  });
}

/**
 * Returns a copy of a PNG with one text chunk per field inserted before the first IDAT chunk. Other chunks are
 * unchanged. The engine's own `output.metadata` path calls this function, so for the same PNG and text the bytes
 * are the same.
 *
 * Root export (#388). `metadata` is checked as `output.metadata` is (see the module notes); a file without the PNG
 * signature, or without an IDAT chunk inside its bytes, fails with `InvalidConfigurationError`. Chunk CRCs before
 * IDAT are not checked. The input is not changed.
 * @param png A PNG file, for example `serializePngImage`'s bytes.
 * @param metadata The text: at least one of description, software, copyright and comment.
 * @returns A new array holding the PNG with the text.
 */
export function addPngTextMetadata(png: Uint8Array, metadata: Readonly<OutputTextMetadata>): Uint8Array {
  if (!(png instanceof Uint8Array)) throw new InvalidConfigurationError("addPngTextMetadata png must be a Uint8Array.");
  const text = requireTextMetadata(metadata, "addPngTextMetadata");
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (png.length < 8 || signature.some((b, i) => png[i] !== b)) throw new InvalidConfigurationError("PNG text metadata needs a PNG signature.");
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  for (let offset = 8; offset + 12 <= png.length;) {
    const length = view.getUint32(offset), type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    if (type === "IDAT") return concat([png.subarray(0, offset), ...pngTextMetadataChunks(text), png.subarray(offset)]);
    offset += 12 + length;
  }
  throw new InvalidConfigurationError("PNG text metadata found no IDAT chunk.");
}
