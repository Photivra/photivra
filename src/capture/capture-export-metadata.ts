// SPDX-License-Identifier: Apache-2.0

/**
 * Shared metadata for a RAW + JPEG pair exported from one simulated capture: IDs, capture time,
 * creator and the engine version.
 *
 * The parser rejects anything missing or invalid; it never fills in a default workflow, time,
 * creator, physical device or file history. The metadata is computed once for both file writers.
 * It never encodes or checks image data.
 * @see docs/SIMULATED_CAPTURE.md for equations, coordinate/unit conventions, blockers and support
 * limits.
 */

import { requireAllowlistedRecord } from "../core/record-validation.js";
import { freezeOwnedData } from "../core/owned-data.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";
import { parseSimulatedCapture, type SimulatedCapture } from "./simulated-capture.js";

export const CAPTURE_EXPORT_METADATA_SCHEMA_VERSION = "0.1.0" as const;
/** Only non-generative workflows. Sampled, AI-generated or composite media would need a separate, reviewed policy. */
export type CaptureExportWorkflow = "human-directed-non-generative" | "fully-procedural-non-generative";
/** Resource and saved-file UUIDs supplied by the caller. The engine never makes random IDs or reads the clock. */
export interface CaptureExportArtifactIdentity { documentId: string; instanceId: string }
/** Input for pairing metadata only. The committed capture must already have a non-nil UUID as its CaptureID. */
export interface CaptureExportMetadataInput {
  capture: SimulatedCapture;
  workflow: CaptureExportWorkflow;
  /** UTC time of the capture event, exactly YYYY-MM-DDTHH:mm:ss.sssZ. It is never scene time. */
  capturedAtUtc: string;
  raw: CaptureExportArtifactIdentity;
  jpeg: CaptureExportArtifactIdentity;
}
/** The shared values, before they are packed into EXIF or DNG tags or an XMP packet. */
export interface CaptureExportSharedMetadata {
  captureId: string;
  capturedAtUtc: string;
  workflow: CaptureExportWorkflow;
  digitalSourceTypeUri: string;
  simulatedCapture: true;
  make: "Photivra";
  model: "Photivra Virtual Camera";
  /** The engine API version that made the capture. It does not claim to be an npm package version. */
  software: string;
  creatorTool: string;
  engineApiVersion: string;
  captureContractVersion: SimulatedCapture["schemaVersion"];
  sceneStateId: string;
  sceneTimeSeconds: number;
  exposure: SimulatedCapture["exposure"];
  focus: SimulatedCapture["focus"];
  equivalentFocalLength35Mm: number;
  geometry: SimulatedCapture["geometry"];
  resolvedGeometry: SimulatedCapture["resolvedGeometry"];
  noise: SimulatedCapture["noise"];
  whiteBalanceIntent: SimulatedCapture["whiteBalanceIntent"];
  models: SimulatedCapture["models"];
}
/** Matching metadata and distinct resource IDs do not prove that the JPEG pixels came from the RAW. */
export interface CaptureExportMetadataPair {
  schemaVersion: typeof CAPTURE_EXPORT_METADATA_SCHEMA_VERSION;
  shared: CaptureExportSharedMetadata;
  raw: CaptureExportArtifactIdentity & { outputRole: "raw" };
  jpeg: CaptureExportArtifactIdentity & { outputRole: "jpeg" };
  imageDataPairing: "not-verified";
}
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  return requireAllowlistedRecord(value, keys, "Export metadata must contain only allowlisted fields.");
}
function uuid(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new InvalidConfigurationError("Export identities require non-nil RFC-variant UUIDs.");
  }
  return value.toLowerCase();
}
function artifact(value: unknown): CaptureExportArtifactIdentity {
  const r = object(value, ["documentId", "instanceId"]);
  return { documentId: uuid(r.documentId), instanceId: uuid(r.instanceId) };
}
/** Strict parser. It rejects missing values and never fills in a default workflow, time, creator, physical device or file history. */
export function parseCaptureExportMetadataInput(value: unknown): CaptureExportMetadataInput {
  const r = object(value, ["capture", "workflow", "capturedAtUtc", "raw", "jpeg"]);
  const capture = parseSimulatedCapture(r.capture);
  if (r.workflow !== "human-directed-non-generative" && r.workflow !== "fully-procedural-non-generative") {
    throw new InvalidConfigurationError("Export workflow requires explicit non-generative classification.");
  }
  if (typeof r.capturedAtUtc !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(r.capturedAtUtc) ||
      !Number.isFinite(Date.parse(r.capturedAtUtc)) || new Date(r.capturedAtUtc).toISOString() !== r.capturedAtUtc) {
    throw new InvalidConfigurationError("Capture-event time requires a valid canonical UTC timestamp.");
  }
  const raw = artifact(r.raw), jpeg = artifact(r.jpeg);
  const ids = [uuid(capture.captureId), raw.documentId, raw.instanceId, jpeg.documentId, jpeg.instanceId];
  if (new Set(ids).size !== ids.length) throw new InvalidConfigurationError("Capture, resource and incarnation IDs must be distinct.");
  return { capture, workflow: r.workflow, capturedAtUtc: r.capturedAtUtc, raw, jpeg };
}
/** Builds the known capture metadata once, for both the RAW and JPEG writers. It never encodes or checks image data. */
export function createCaptureExportMetadataPair(input: CaptureExportMetadataInput): CaptureExportMetadataPair {
  const v = parseCaptureExportMetadataInput(input), c = v.capture;
  const software = "Photivra " + c.engineApiVersion;
  const shared: CaptureExportSharedMetadata = {
    captureId: uuid(c.captureId), capturedAtUtc: v.capturedAtUtc, workflow: v.workflow,
    digitalSourceTypeUri: "http://cv.iptc.org/newscodes/digitalsourcetype/" +
      (v.workflow === "human-directed-non-generative" ? "digitalCreation" : "algorithmicMedia"),
    simulatedCapture: true, make: "Photivra", model: "Photivra Virtual Camera", software, creatorTool: software,
    engineApiVersion: c.engineApiVersion, captureContractVersion: c.schemaVersion, sceneStateId: c.sceneStateId,
    sceneTimeSeconds: c.sceneTimeSeconds, exposure: c.exposure, focus: c.focus,
    equivalentFocalLength35Mm: c.equivalentFocalLength35Mm, geometry: c.geometry, resolvedGeometry: c.resolvedGeometry,
    noise: c.noise, whiteBalanceIntent: c.whiteBalanceIntent, models: c.models
  };
  const pair: CaptureExportMetadataPair = { schemaVersion: CAPTURE_EXPORT_METADATA_SCHEMA_VERSION, shared,
    raw: { ...v.raw, outputRole: "raw" }, jpeg: { ...v.jpeg, outputRole: "jpeg" }, imageDataPairing: "not-verified" };
  return freezeOwnedData(JSON.parse(JSON.stringify(pair)) as CaptureExportMetadataPair);
}
