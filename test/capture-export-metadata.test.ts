// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { createSimulatedCapture, createCaptureExportMetadataPair, parseCaptureExportMetadataInput,
  type CaptureExportMetadataInput } from "../src/index.js";
import { loadLinearCaptureInput } from "./helpers/linear-capture-fixture.js";

const ids = [1, 2, 3, 4, 5].map((i) => `00000000-0000-4000-8000-00000000000${i}`);
function input(): CaptureExportMetadataInput {
  const c = loadLinearCaptureInput(); c.captureId = ids[0]!;
  return { capture: createSimulatedCapture(c).value, workflow: "human-directed-non-generative",
    capturedAtUtc: "2026-10-01T19:00:00.123Z", raw: { documentId: ids[1]!, instanceId: ids[2]! },
    jpeg: { documentId: ids[3]!, instanceId: ids[4]! } };
}
describe("capture export metadata foundation", () => {
  it("projects one committed capture with distinct resources and explicit unverified image pairing", () => {
    const v = input(), before = JSON.stringify(v), p = createCaptureExportMetadataPair(v);
    expect(p.shared.captureId).toBe(v.capture.captureId);
    expect(p.shared.exposure).toEqual(v.capture.exposure); expect(p.shared.focus).toEqual(v.capture.focus);
    expect(p.shared.noise).toEqual(v.capture.noise); expect(p.shared.models).toEqual(v.capture.models);
    expect(p.raw.outputRole).toBe("raw"); expect(p.jpeg.outputRole).toBe("jpeg");
    expect(p.raw.documentId).not.toBe(p.jpeg.documentId); expect(p.imageDataPairing).toBe("not-verified");
    expect(p.shared.make).toBe("Photivra"); expect(p.shared.model).toBe("Photivra Virtual Camera");
    expect(p.shared.software).toBe("Photivra " + v.capture.engineApiVersion);
    expect(p.shared.creatorTool).toBe(p.shared.software); expect(p.shared.simulatedCapture).toBe(true);
    expect(createCaptureExportMetadataPair(v)).toEqual(p); expect(JSON.stringify(v)).toBe(before);
    expect(Object.isFrozen(p.shared.geometry)).toBe(true); expect(Object.isFrozen(v.raw)).toBe(false);
    v.raw.documentId = ids[4]!; expect(p.raw.documentId).toBe(ids[1]);
  });
  it("requires an explicit truthful workflow and emits its exact IPTC concept URI", () => {
    expect(createCaptureExportMetadataPair(input()).shared.digitalSourceTypeUri).toBe(
      "http://cv.iptc.org/newscodes/digitalsourcetype/digitalCreation");
    expect(createCaptureExportMetadataPair({ ...input(), workflow: "fully-procedural-non-generative" }).shared.digitalSourceTypeUri).toBe(
      "http://cv.iptc.org/newscodes/digitalsourcetype/algorithmicMedia");
    for (const workflow of [undefined, null, "digitalCapture", "trainedAlgorithmicMedia", "composite", ""]) {
      expect(() => parseCaptureExportMetadataInput({ ...input(), workflow })).toThrow();
    }
  });
  it("keeps event time separate from scene time and rejects invalid or implicit dates", () => {
    const v = input(), c = loadLinearCaptureInput(); c.captureId = ids[0]!; c.sceneTimeSeconds = 42;
    const p = createCaptureExportMetadataPair({ ...v, capture: createSimulatedCapture(c).value });
    expect(p.shared.sceneTimeSeconds).toBe(42); expect(p.shared.capturedAtUtc).toBe(v.capturedAtUtc);
    for (const capturedAtUtc of [undefined, 0, "", "2026-10-01", "2026-10-01T19:00:00Z",
      "2026-10-01T19:00:00.123-04:00", "2026-02-30T19:00:00.123Z", "2026-10-01T25:00:00.123Z"]) {
      expect(() => parseCaptureExportMetadataInput({ ...v, capturedAtUtc })).toThrow();
    }
  });
  it("rejects malformed and reused IDs, including case-insensitive collisions", () => {
    const v = input();
    for (const documentId of ["opaque", "00000000-0000-0000-0000-000000000000", ids[0], ids[2], ids[3], ids[4], null]) {
      expect(() => parseCaptureExportMetadataInput({ ...v, raw: { ...v.raw, documentId } })).toThrow();
    }
    const c = loadLinearCaptureInput(); expect(() => createCaptureExportMetadataPair({ ...v, capture: createSimulatedCapture(c).value })).toThrow();
    const upper = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    expect(() => parseCaptureExportMetadataInput({ ...v, raw: { documentId: upper, instanceId: upper.toUpperCase() } })).toThrow();
    expect(createCaptureExportMetadataPair({ ...v, raw: { ...v.raw, documentId: upper.toUpperCase() } }).raw.documentId).toBe(upper);
  });
  it("preserves all orientations/off-center geometry and finite/infinity focus without serializing EXIF transforms", () => {
    for (const orientation of ["landscape", "portrait-clockwise", "landscape-inverted", "portrait-counter-clockwise"] as const) {
      const v = input(), c = loadLinearCaptureInput(); c.captureId = ids[0]!; c.focus = { kind: "infinity" };
      c.geometry = { ...c.geometry, orientation, activeCaptureRect: { x: 1, y: 2, width: 100, height: 100 } };
      const capture = createSimulatedCapture(c).value, p = createCaptureExportMetadataPair({ ...v, capture });
      expect(p.shared.geometry).toEqual(capture.geometry); expect(p.shared.resolvedGeometry).toEqual(capture.resolvedGeometry);
      expect(p.shared.focus).toEqual({ kind: "infinity" });
      expect(p.shared.equivalentFocalLength35Mm).toBe(capture.equivalentFocalLength35Mm);
    }
  });
  it("fails closed on private/cosmetic fields and does not emit missing calibration, rights, hashes or RAW claims", () => {
    const v = input();
    for (const patch of [{ gps: "private" }, { artist: "Photivra" }, { capturedAtUtc: undefined }, { cameraSerialNumber: "fake" }]) {
      expect(() => parseCaptureExportMetadataInput({ ...v, ...patch })).toThrow();
    }
    expect(() => parseCaptureExportMetadataInput({ ...v, jpeg: { ...v.jpeg, path: "/private" } })).toThrow();
    expect(() => parseCaptureExportMetadataInput(null)).toThrow();
    expect(() => parseCaptureExportMetadataInput({ ...v, capture: { ...v.capture, equivalentFocalLength35Mm: 0 } })).toThrow();
    const json = JSON.stringify(createCaptureExportMetadataPair(v));
    for (const field of ["Artist", "GPS", "SerialNumber", "RawDataUniqueID", "SimulationHash", "UniqueCameraModel", "AI Prompt", "FileSource", "SceneType"]) {
      expect(json).not.toContain(field);
    }
  });
});
