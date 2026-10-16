import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { createPhotographicExportPair, parseSimulatedCapture, PHOTOGRAPHIC_EXPORT_PIPELINE_VERSION } from "../src/index.js";
import { loadPhotographicExportInput } from "./helpers/photographic-export-fixture.js";

async function historicalPair(): Promise<{ input: ReturnType<typeof loadPhotographicExportInput>;
  pair: Awaited<ReturnType<typeof createPhotographicExportPair>> }> {
  const input = loadPhotographicExportInput();
  // Replay the historical capture version rather than stamp a newly created capture.
  input.reconstruction.rawFrame = { ...input.reconstruction.rawFrame,
    capture: parseSimulatedCapture({ ...input.reconstruction.rawFrame.capture, engineApiVersion: "0.106.0" }) };
  return { input, pair: await createPhotographicExportPair(input) };
}

it("preserves the historical paired-export identity and complete file bytes", async () => {
  const { pair } = await historicalPair();
  const identities = { simulationHash: pair.simulationHash, rawDataUniqueId: pair.rawDataUniqueId,
    dngSha256: pair.dng.sha256, jpegSha256: pair.jpeg.sha256 };
  // Captured from main 412da46 before the serializer consolidation; re-pinned for 2.0 pipeline 0.2.0 (new RAW sample
  // readout fields and highlight mode enter SimulationHash; DNG 1.4 tags, AsShotNeutral and XMP pipeline versions change
  // the file bytes; the JPEG Exif APP1 then gained the Exif 2.32 mandatory tags). RawDataUniqueID is unchanged because
  // the RAW codes are unchanged, and SimulationHash is unchanged by the Exif completion.
  expect(identities).toEqual({"simulationHash":"9861e862dc45ed79db0a3044750d90bd6b6667e4e05bffdb5dc8f60b6b427a0a","rawDataUniqueId":"4c801d757c7b186763207e615920bfca","dngSha256":"2d7cbb31d708bff38a1448eb781ec15fb6e6686cf01f96ed8493b5a7996a9678","jpegSha256":"3c1ebcc039d1cc683064aab4ebcf0e9ce13e8445c57ebf2ada65d6dd7298a830"});
});

/*
 * Independent spot values beside the hash lock above, so a hash change can be localized to the
 * serializer, the identity recipe, the RAW codes, the DNG container or the JPEG stream. The
 * canonical form is re-derived here (recursively sorted object keys, array order kept, JSON.stringify
 * scalars) and hashed with node:crypto; no engine serializer or hash helper is used.
 */
function independentCanonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(independentCanonical).join(",") + "]";
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return "{" + Object.keys(record).filter((key) => record[key] !== undefined).sort()
      .map((key) => JSON.stringify(key) + ":" + independentCanonical(record[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}
const sha256Hex = (data: string | Uint8Array): string => createHash("sha256").update(data).digest("hex");

it("re-derives the export identities and container structure independently", async () => {
  const { input, pair } = await historicalPair();
  const frame = pair.source.value.rawFrame;

  // RAW data unique id: first 128 bits of SHA-256 over the canonical RAW identity record.
  const rawRecord = { schema: "photivra-raw-data-id-0.1", width: frame.nativePixelWidth, height: frame.nativePixelHeight,
    cfa: frame.colorSamplingProfile.layout, containerBitDepth: 16, codes: frame.samples.map((s) => s.rawCode) };
  expect(pair.rawDataUniqueId).toBe(sha256Hex(independentCanonical(rawRecord)).slice(0, 32));

  // Simulation hash: SHA-256 over the canonical replay record (schema and pipeline versions, frame,
  // reconstruction, colour, scene, white balance, rendering, JPEG quantization and highlight mode,
  // which defaults to "clip").
  const simulationRecord = { schema: pair.schemaVersion, pipeline: PHOTOGRAPHIC_EXPORT_PIPELINE_VERSION,
    highlightMode: input.highlightMode ?? "clip", rawFrame: frame, phaseProfiles: pair.source.value.phaseProfiles,
    region: pair.source.value.region, colorProfile: input.colorProfile, sceneProfile: input.sceneProfile,
    whiteBalance: input.whiteBalance, rendering: input.rendering, jpegQuantizationStep: input.jpegQuantizationStep };
  expect(pair.simulationHash).toBe(sha256Hex(independentCanonical(simulationRecord)));

  // File digests are plain SHA-256 of the emitted bytes.
  expect(pair.dng.sha256).toBe(sha256Hex(pair.dng.bytes));
  expect(pair.jpeg.sha256).toBe(sha256Hex(pair.jpeg.bytes));

  // DNG (TIFF 6.0 / DNG 1.x): little-endian header, image size tags 256/257, 16-bit samples, and the
  // single strip at tag 273 holds every RAW code as an unsigned little-endian 16-bit value.
  const dng = new DataView(pair.dng.bytes.buffer, pair.dng.bytes.byteOffset, pair.dng.bytes.byteLength);
  expect(String.fromCharCode(pair.dng.bytes[0]!, pair.dng.bytes[1]!)).toBe("II");
  expect(dng.getUint16(2, true)).toBe(42);
  const ifd = dng.getUint32(4, true), tags = new Map<number, { type: number; count: number; value: number }>();
  for (let i = 0, n = dng.getUint16(ifd, true); i < n; i++) {
    const at = ifd + 2 + 12 * i, type = dng.getUint16(at + 2, true);
    tags.set(dng.getUint16(at, true), { type, count: dng.getUint32(at + 4, true),
      value: type === 3 ? dng.getUint16(at + 8, true) : dng.getUint32(at + 8, true) });
  }
  expect(tags.get(256)!.value).toBe(frame.nativePixelWidth);
  expect(tags.get(257)!.value).toBe(frame.nativePixelHeight);
  expect(tags.get(258)!.value).toBe(16);
  expect(tags.get(279)!.value).toBe(frame.samples.length * 2);
  const strip = tags.get(273)!.value;
  frame.samples.forEach((s, i) => expect(dng.getUint16(strip + 2 * i, true)).toBe(s.rawCode));

  // JPEG (ITU-T T.81): SOI ... EOI, and the baseline SOF0 frame header carries the output size.
  const jpeg = pair.jpeg.bytes;
  expect([jpeg[0], jpeg[1], jpeg[jpeg.length - 2], jpeg[jpeg.length - 1]]).toEqual([0xff, 0xd8, 0xff, 0xd9]);
  let sof = -1;
  for (let at = 2; at < jpeg.length - 1 && sof < 0;) {
    if (jpeg[at] !== 0xff) throw new Error("JPEG marker expected");
    const marker = jpeg[at + 1]!, length = (jpeg[at + 2]! << 8) | jpeg[at + 3]!;
    if (marker === 0xc0) sof = at; else at += 2 + length;
  }
  expect(sof).toBeGreaterThan(0);
  expect((jpeg[sof + 5]! << 8) | jpeg[sof + 6]!).toBe(pair.processedOutputView.pixelHeight);
  expect((jpeg[sof + 7]! << 8) | jpeg[sof + 8]!).toBe(pair.processedOutputView.pixelWidth);
});
