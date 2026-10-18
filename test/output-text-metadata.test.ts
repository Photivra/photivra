// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { crc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { InvalidConfigurationError, parseDngRawImage, serializeNativeRawDng, simulateCapture, simulateIdealReference,
  type OutputTextMetadata, type SimulateCaptureOptions } from "../src/index.js";
import { addJpegTextMetadata, addPngTextMetadata, parseOutputTextMetadata } from "../src/output/text-metadata.js";

const sha = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const utf8 = new TextDecoder("utf-8", { fatal: true });
const latin1 = new TextDecoder("latin1");

/** JPEG marker segments up to SOS: marker, payload and byte range; `tail` is everything from SOS on. */
function jpegSegments(jpeg: Uint8Array): { segments: { marker: number; payload: Uint8Array; bytes: Uint8Array }[]; tail: Uint8Array } {
  expect([jpeg[0], jpeg[1]]).toEqual([0xff, 0xd8]);
  const segments: { marker: number; payload: Uint8Array; bytes: Uint8Array }[] = [];
  let o = 2;
  while (jpeg[o + 1] !== 0xda) {
    expect(jpeg[o]).toBe(0xff);
    const length = (jpeg[o + 2]! << 8) | jpeg[o + 3]!;
    segments.push({ marker: jpeg[o + 1]!, payload: jpeg.subarray(o + 4, o + 2 + length), bytes: jpeg.subarray(o, o + 2 + length) });
    o += 2 + length;
  }
  return { segments, tail: jpeg.subarray(o) };
}
const XMP_ID = "http://ns.adobe.com/xap/1.0/\0";
function jpegXmp(jpeg: Uint8Array): string[] {
  return jpegSegments(jpeg).segments.filter((s) => s.marker === 0xe1 && latin1.decode(s.payload.subarray(0, XMP_ID.length)) === XMP_ID)
    .map((s) => utf8.decode(s.payload.subarray(XMP_ID.length)));
}
/** Text of an XMP property: a simple element, or the x-default item of a language alternative. XML entities decoded. */
function xmpProperty(packet: string, name: string): string | undefined {
  const m = new RegExp("<" + name + ">(?:<rdf:Alt><rdf:li xml:lang=\"x-default\">)?([^<]*)(?:</rdf:li></rdf:Alt>)?</" + name + ">").exec(packet);
  return m ? m[1]!.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&") : undefined;
}

interface PngChunk { type: string; data: Uint8Array; bytes: Uint8Array; crcValid: boolean }
function pngChunks(png: Uint8Array): PngChunk[] {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength), out: PngChunk[] = [];
  for (let o = 8; o < png.length;) {
    const length = view.getUint32(o), typeBytes = png.subarray(o + 4, o + 8), data = png.subarray(o + 8, o + 8 + length);
    out.push({ type: latin1.decode(typeBytes), data, bytes: png.subarray(o, o + 12 + length), crcValid: view.getUint32(o + 8 + length) === crc32(data, crc32(typeBytes)) }); // Node's zlib CRC-32, independent of the encoder's
    o += 12 + length;
  }
  return out;
}
/** Decodes one tEXt or iTXt chunk to its keyword and text (PNG Third Edition §11.3.3.2 and §11.3.3.4). */
function pngText(chunk: PngChunk): { keyword: string; text: string } {
  const nul = chunk.data.indexOf(0), keyword = latin1.decode(chunk.data.subarray(0, nul));
  if (chunk.type === "tEXt") return { keyword, text: latin1.decode(chunk.data.subarray(nul + 1)) };
  expect(chunk.type).toBe("iTXt");
  expect([chunk.data[nul + 1], chunk.data[nul + 2]]).toEqual([0, 0]); // uncompressed, method 0
  const language = chunk.data.indexOf(0, nul + 3), translated = chunk.data.indexOf(0, language + 1);
  expect([language, translated]).toEqual([nul + 3, nul + 4]); // empty language tag and translated keyword
  return { keyword, text: utf8.decode(chunk.data.subarray(translated + 1)) };
}

/** IFD0 entries of a little-endian TIFF: tag → raw value bytes. */
function tiffIfd0(bytes: Uint8Array): Map<number, { type: number; data: Uint8Array }> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), out = new Map<number, { type: number; data: Uint8Array }>();
  expect(latin1.decode(bytes.subarray(0, 2))).toBe("II");
  const ifd = view.getUint32(4, true), count = view.getUint16(ifd, true), sizes: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 10: 8, 12: 8 };
  let previous = -1;
  for (let i = 0; i < count; i++) {
    const p = ifd + 2 + i * 12, tag = view.getUint16(p, true), type = view.getUint16(p + 2, true), n = view.getUint32(p + 4, true), size = n * sizes[type]!;
    expect(tag).toBeGreaterThan(previous); previous = tag; // TIFF 6.0: ascending tag order
    const at = size <= 4 ? p + 8 : view.getUint32(p + 8, true);
    out.set(tag, { type, data: bytes.subarray(at, at + size) });
  }
  return out;
}
const tiffAscii = (entry: { data: Uint8Array } | undefined): string | undefined => entry ? latin1.decode(entry.data.subarray(0, entry.data.length - 1)) : undefined;

const META = { description: "Test chart <A & B>", software: "Example Viewer 1.2", copyright: "Rechte: Prüfgruppe", comment: "Line one\nLine two" } as const satisfies OutputTextMetadata;
const UNICODE = { description: "Mesure de netteté – 日本語", software: "Тест 1.0", copyright: "Rights: test owner", comment: "Smile 🙂" } as const satisfies OutputTextMetadata;

/**
 * Digests of the encoded files at origin/main 0e7a046 (engine 2.3.0, before output.metadata existed). The 2.3.0
 * suite had no lock on facade PNG or DNG bytes; these prove the default path is unchanged.
 */
const V2_3_0_FILES: { name: string; options: SimulateCaptureOptions; file: "jpeg" | "png" | "dng"; sha256: string; reference?: true }[] = [
  { name: "jpeg", options: { scene: { preset: "checkerboard" }, output: { width: 8, height: 8, format: "jpeg" } }, file: "jpeg",
    sha256: "dd2832317168ac961e1a46bb7ed9a9a2c14237b35c6e9b5c66a13257bd6262f5" },
  { name: "png", options: { scene: { preset: "checkerboard" }, output: { width: 8, height: 8, format: "png" } }, file: "png",
    sha256: "74b2ca46bd4dd766dd77bfdf9afd084c2f436c8969a2738d4409cf45feb6a809" },
  { name: "png display-p3 16-bit", options: { scene: { preset: "siemens-star" }, output: { width: 6, height: 4, format: "png", colorEncoding: "display-p3", bitDepth: 16 } }, file: "png",
    sha256: "374ae4260af6e3f0fbd2f5a0fff0f69fbc00a993d93744a051d300501b5d4d96" },
  { name: "dng", options: { scene: { preset: "siemens-star" }, output: { width: 8, height: 8, format: "dng", dng: { capturedAtUtc: "2026-10-18T12:00:00.000Z" } } }, file: "dng",
    sha256: "c036c07809a49edb049cd92f0b96f9042f5d7bffe0f4f24fbc2fc2a0cabf3d71" },
  { name: "ideal reference png", options: { scene: { preset: "checkerboard" }, output: { width: 8, height: 8, format: "png" } }, file: "png",
    sha256: "7f9f7444621aa0fbba63743e74e4703baab5be0ab4ef97bce464f6fe99093325", reference: true }
];
const withMetadata = (options: SimulateCaptureOptions, metadata: OutputTextMetadata): SimulateCaptureOptions => ({ ...options, output: { ...options.output, metadata } });

describe("output.metadata (2.4)", { timeout: 120_000 }, () => {
  it("leaves every encoded file byte-identical to 2.3.0 when no metadata is given", async () => {
    for (const c of V2_3_0_FILES) {
      const image = c.reference ? (await simulateIdealReference(c.options)).image : (await simulateCapture(c.options)).image;
      expect(sha((image as unknown as Record<string, Uint8Array>)[c.file]!), c.name).toBe(c.sha256);
    }
    const plain = await simulateCapture(V2_3_0_FILES[0]!.options);
    expect(plain.assumptions.some((a) => a.id === "output.metadata")).toBe(false);
  });

  it("JPEG: adds the fields to the existing XMP packet and a COM segment, and changes nothing else", async () => {
    const plain = (await simulateCapture(V2_3_0_FILES[0]!.options)).image.jpeg!;
    const result = await simulateCapture(withMetadata(V2_3_0_FILES[0]!.options, META)), tagged = result.image.jpeg!;
    const a = jpegSegments(plain), b = jpegSegments(tagged);
    expect(b.tail).toEqual(a.tail); // SOS and entropy-coded data unchanged
    // Same segment sequence, with one COM added after the APPn segments (T.81 B.2.4.5).
    expect(b.segments.map((s) => s.marker)).toEqual([0xe0, 0xe1, 0xe1, 0xe2, 0xfe, 0xdb, 0xc0, 0xc4]);
    expect(a.segments.map((s) => s.marker)).toEqual([0xe0, 0xe1, 0xe1, 0xe2, 0xdb, 0xc0, 0xc4]);
    const unchanged = (list: typeof a.segments): string[] => list.filter((s) => s.marker !== 0xfe && !(s.marker === 0xe1 && latin1.decode(s.payload.subarray(0, XMP_ID.length)) === XMP_ID)).map((s) => sha(s.bytes));
    expect(unchanged(b.segments)).toEqual(unchanged(a.segments));
    expect(utf8.decode(b.segments.find((s) => s.marker === 0xfe)!.payload)).toBe(META.comment);
    // One XMP packet: the original one with a second rdf:Description of the same resource before </rdf:RDF>.
    const [before] = jpegXmp(plain), packets = jpegXmp(tagged), packet = packets[0]!;
    expect(packets).toHaveLength(1);
    const close = before!.lastIndexOf("</rdf:RDF>");
    expect(packet.startsWith(before!.slice(0, close))).toBe(true);
    expect(packet.endsWith(before!.slice(close))).toBe(true);
    expect(packet.match(/<rdf:Description rdf:about=""/g)).toHaveLength(2);
    expect(xmpProperty(packet, "dc:description")).toBe(META.description);
    expect(xmpProperty(packet, "dc:rights")).toBe(META.copyright);
    expect(xmpProperty(packet, "xmp:CreatorTool")).toBe(META.software);
    expect(xmpProperty(packet, "exif:UserComment")).toBe(META.comment);
    expect(packet).toContain("Test chart &lt;A &amp; B&gt;");
    expect(result.assumptions.find((a) => a.id === "output.metadata")?.value).toMatchObject({ fields: ["description", "software", "copyright", "comment"] });
    // Deterministic, and only the requested fields and namespaces are written.
    expect(sha((await simulateCapture(withMetadata(V2_3_0_FILES[0]!.options, META))).image.jpeg!)).toBe(sha(tagged));
    const only = jpegXmp((await simulateCapture(withMetadata(V2_3_0_FILES[0]!.options, { software: "Example Viewer" }))).image.jpeg!)[0]!;
    expect(only).not.toContain("xmlns:dc=");
    expect(only).not.toContain("xmlns:exif=");
    expect(xmpProperty(only, "xmp:CreatorTool")).toBe("Example Viewer");
  });

  it("JPEG: carries non-Latin text in UTF-8 and the largest fields still fit one APP1 segment", async () => {
    const tagged = (await simulateCapture(withMetadata(V2_3_0_FILES[0]!.options, UNICODE))).image.jpeg!;
    const packet = jpegXmp(tagged)[0]!;
    expect(xmpProperty(packet, "dc:description")).toBe(UNICODE.description);
    expect(xmpProperty(packet, "xmp:CreatorTool")).toBe(UNICODE.software);
    expect(utf8.decode(jpegSegments(tagged).segments.find((s) => s.marker === 0xfe)!.payload)).toBe(UNICODE.comment);
    // Worst-case XML escaping: 4 × 2048 "&" become 4 × 10 240 bytes of "&amp;".
    const amp = "&".repeat(2048), big = (await simulateCapture(withMetadata(V2_3_0_FILES[0]!.options, { description: amp, software: amp, copyright: amp, comment: amp }))).image.jpeg!;
    expect(xmpProperty(jpegXmp(big)[0]!, "dc:rights")).toBe(amp);
  });

  it("JPEG helper: writes a new XMP packet when a JPEG has none and rejects malformed streams", async () => {
    const plain = (await simulateCapture(V2_3_0_FILES[0]!.options)).image.jpeg!, { segments, tail } = jpegSegments(plain);
    const parts = [Uint8Array.of(0xff, 0xd8), ...segments.filter((s) => s.marker !== 0xe1).map((s) => s.bytes), tail];
    const bare = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    parts.reduce((o, p) => { bare.set(p, o); return o + p.length; }, 0);
    const tagged = addJpegTextMetadata(bare, { description: "Only text" });
    expect(jpegSegments(tagged).segments.map((s) => s.marker)).toEqual([0xe0, 0xe2, 0xe1, 0xdb, 0xc0, 0xc4]);
    expect(jpegXmp(tagged)[0]!.startsWith('<x:xmpmeta xmlns:x="adobe:ns:meta/">')).toBe(true);
    expect(xmpProperty(jpegXmp(tagged)[0]!, "dc:description")).toBe("Only text");
    expect(() => addJpegTextMetadata(Uint8Array.of(1, 2, 3, 4), { comment: "x" })).toThrow(/starting with SOI/);
    expect(() => addJpegTextMetadata(plain.subarray(0, 30), { comment: "x" })).toThrow(InvalidConfigurationError);
  });

  it("PNG: tEXt for Latin-1 text, iTXt otherwise, before IDAT, with valid CRCs and nothing else changed", async () => {
    const options = V2_3_0_FILES[1]!.options, plain = (await simulateCapture(options)).image.png!;
    for (const [metadata, types] of [[META, ["tEXt", "tEXt", "tEXt", "tEXt"]], [UNICODE, ["iTXt", "iTXt", "tEXt", "iTXt"]]] as const) {
      const tagged = (await simulateCapture(withMetadata(options, metadata))).image.png!, chunks = pngChunks(tagged);
      expect(chunks.every((c) => c.crcValid)).toBe(true);
      const text = chunks.filter((c) => c.type === "tEXt" || c.type === "iTXt");
      expect(text.map((c) => c.type)).toEqual(types);
      expect(text.map(pngText)).toEqual([{ keyword: "Description", text: metadata.description }, { keyword: "Software", text: metadata.software },
        { keyword: "Copyright", text: metadata.copyright }, { keyword: "Comment", text: metadata.comment }]);
      const order = chunks.map((c) => c.type);
      expect(order[0]).toBe("IHDR");
      expect(order.lastIndexOf("iTXt") < order.indexOf("IDAT") && order.lastIndexOf("tEXt") < order.indexOf("IDAT")).toBe(true);
      // Removing the text chunks gives back the 2.3.0 file.
      const rest = chunks.filter((c) => c.type !== "tEXt" && c.type !== "iTXt").map((c) => c.bytes);
      const rebuilt = new Uint8Array(8 + rest.reduce((n, c) => n + c.length, 0));
      rebuilt.set(tagged.subarray(0, 8)); rest.reduce((o, c) => { rebuilt.set(c, o); return o + c.length; }, 8);
      expect(sha(rebuilt)).toBe(V2_3_0_FILES[1]!.sha256);
      expect(sha(plain)).toBe(V2_3_0_FILES[1]!.sha256);
    }
    const reference = await simulateIdealReference(withMetadata(V2_3_0_FILES[4]!.options, { comment: "Reference" }));
    expect(pngChunks(reference.image.png!).filter((c) => c.type === "tEXt").map(pngText)).toEqual([{ keyword: "Comment", text: "Reference" }]);
    expect(reference.assumptions.some((a) => a.id === "output.metadata")).toBe(true);
    expect(() => addPngTextMetadata(Uint8Array.of(1, 2, 3), { comment: "x" })).toThrow(/PNG signature/);
    expect(() => addPngTextMetadata(plain.subarray(0, 33), { comment: "x" })).toThrow(/no IDAT/);
  });

  it("DNG: appends ASCII description, adds Copyright and an XMP packet in tag 700; codes and other tags unchanged", async () => {
    const options = V2_3_0_FILES[3]!.options, plain = (await simulateCapture(options)).image.dng!;
    const tagged = (await simulateCapture(withMetadata(options, { ...META, copyright: "Rights: test owner 2026" }))).image.dng!;
    const a = tiffIfd0(plain), b = tiffIfd0(tagged), statement = tiffAscii(a.get(270))!;
    expect(statement).toMatch(/^Simulated capture: packed native RAW/);
    expect(tiffAscii(b.get(270))).toBe(statement + " " + META.description);
    expect(tiffAscii(b.get(33432))).toBe("Rights: test owner 2026");
    expect(a.has(33432) || a.has(700)).toBe(false);
    expect(tiffAscii(b.get(305))).toBe(tiffAscii(a.get(305))); // Software keeps naming the writer
    expect(b.get(700)!.type).toBe(1);
    const xmp = utf8.decode(b.get(700)!.data);
    expect(xmpProperty(xmp, "dc:description")).toBe(statement + " " + META.description);
    expect(xmpProperty(xmp, "xmp:CreatorTool")).toBe(META.software);
    expect(xmpProperty(xmp, "dc:rights")).toBe("Rights: test owner 2026");
    expect(xmpProperty(xmp, "exif:UserComment")).toBe(META.comment);
    for (const [tag, entry] of a) if (tag !== 270 && tag !== 273 && tag !== 34665) expect(sha(b.get(tag)!.data), String(tag)).toBe(sha(entry.data));
    const pa = parseDngRawImage({ bytes: plain }), pb = parseDngRawImage({ bytes: tagged });
    expect(sha(new Uint8Array(pb.codes.buffer))).toBe(sha(new Uint8Array(pa.codes.buffer)));
    expect([pb.whiteLevel, pb.activeArea, pb.width, pb.height]).toEqual([pa.whiteLevel, pa.activeArea, pa.width, pa.height]);
    // Non-ASCII text: only XMP carries it; the ASCII tags keep the statement and omit the copyright.
    const unicode = tiffIfd0((await simulateCapture(withMetadata(options, { description: UNICODE.description, copyright: UNICODE.software }))).image.dng!);
    expect(tiffAscii(unicode.get(270))).toBe(statement);
    expect(unicode.has(33432)).toBe(false);
    const uxmp = utf8.decode(unicode.get(700)!.data);
    expect(xmpProperty(uxmp, "dc:description")).toBe(statement + " " + UNICODE.description);
    expect(xmpProperty(uxmp, "dc:rights")).toBe(UNICODE.software);
    expect(sha((await simulateCapture(withMetadata(options, { ...META, copyright: "Rights: test owner 2026" }))).image.dng!)).toBe(sha(tagged));
  });

  it("rejects invalid metadata with clear errors", async () => {
    const base = V2_3_0_FILES[1]!.options;
    const cases: [unknown, RegExp][] = [
      ["text", /output\.metadata must be an object/],
      [{}, /output\.metadata must set at least one of description, software, copyright or comment/],
      [{ title: "x" }, /Unknown output\.metadata field: title/],
      [{ description: "" }, /output\.metadata\.description must be a non-empty string/],
      [{ software: 3 }, /output\.metadata\.software must be a non-empty string/],
      [{ comment: "a\0b" }, /output\.metadata\.comment must not contain NUL/],
      [{ comment: "a\r\nb" }, /control characters other than line feed/],
      [{ comment: "a\tb" }, /control characters other than line feed/],
      [{ comment: "a\u0085b" }, /control characters other than line feed/],
      [{ comment: "a￿b" }, /U\+FFFE\/U\+FFFF/],
      [{ copyright: "a\ud800b" }, /output\.metadata\.copyright must be valid Unicode text \(it has an unpaired UTF-16 surrogate\)/],
      [{ copyright: "\udc00" }, /unpaired UTF-16 surrogate/],
      [{ description: "x".repeat(2049) }, /output\.metadata\.description must be at most 2048 UTF-8 bytes \(it has 2049\)/],
      [{ description: "€".repeat(683) }, /at most 2048 UTF-8 bytes \(it has 2049\)/]
    ];
    for (const [metadata, message] of cases) {
      const run = simulateCapture({ ...base, output: { ...base.output, metadata: metadata as OutputTextMetadata } });
      await expect(run, String(message)).rejects.toThrow(InvalidConfigurationError);
      await expect(simulateCapture({ ...base, output: { ...base.output, metadata: metadata as OutputTextMetadata } })).rejects.toThrow(message);
    }
    expect(parseOutputTextMetadata({ description: "€".repeat(682) }, "m")?.description).toHaveLength(682);
    expect(parseOutputTextMetadata({ comment: "two\nlines 🙂" }, "m")).toEqual({ comment: "two\nlines 🙂" });
    await expect(simulateCapture({ scene: { preset: "uniform" }, output: { width: 4, height: 4, metadata: { comment: "x" } } }))
      .rejects.toThrow('output.metadata applies only to output.format "jpeg", "png" or "dng".');
    await expect(simulateIdealReference({ scene: { preset: "uniform" }, output: { width: 4, height: 4, format: "srgb-16", metadata: { comment: "x" } } }))
      .rejects.toThrow(/output\.metadata applies only/);
    const shot = await simulateCapture(V2_3_0_FILES[3]!.options);
    const colorProfile = shot.request.development.colorProfile;
    await expect(serializeNativeRawDng({ raw: shot.raw, colorProfile, textMetadata: { comment: "\u0007" } }))
      .rejects.toThrow("Native RAW DNG: textMetadata.comment must not contain control characters");
  });
});
