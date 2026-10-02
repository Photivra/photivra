// SPDX-License-Identifier: Apache-2.0

import { requireAllowlistedRecord } from "../core/record-validation.js";
import { freezeOwnedData } from "../core/owned-data.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";
import { parseSimulatedCapture, type SimulatedCapture } from "./simulated-capture.js";

export const CAPTURE_EXPORT_METADATA_SCHEMA_VERSION = "0.1.0" as const;
/** Non-generative workflows only; sampled/AI/composite media need a separate reviewed policy. */
export type CaptureExportWorkflow = "human-directed-non-generative" | "fully-procedural-non-generative";
/** Caller-owned resource and saved-incarnation UUIDs; no random IDs or wall clock in the engine. */
export interface CaptureExportArtifactIdentity { documentId: string; instanceId: string }
/** Metadata-only pairing input. CaptureID must already be a non-nil UUID on the committed capture. */
export interface CaptureExportMetadataInput {
  capture: SimulatedCapture;
  workflow: CaptureExportWorkflow;
  /** Explicit capture-event UTC timestamp, exactly YYYY-MM-DDTHH:mm:ss.sssZ; never scene time. */
  capturedAtUtc: string;
  raw: CaptureExportArtifactIdentity;
  jpeg: CaptureExportArtifactIdentity;
}
/** Shared semantic values, not packed EXIF/DNG tags or an XMP packet. */
export interface CaptureExportSharedMetadata {
  captureId: string;
  capturedAtUtc: string;
  workflow: CaptureExportWorkflow;
  digitalSourceTypeUri: string;
  simulatedCapture: true;
  make: "Photivra";
  model: "Photivra Virtual Camera";
  /** Explicitly the captured engine API version, not a claim of an npm distribution version. */
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
/** Equal shared metadata and distinct resource IDs do not prove RAW/JPEG pixel derivation. */
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
/** Fail-closed parser; no default workflow, time, creator, physical-device or file lineage claims. */
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
/** Projects known capture metadata once for both future writers; never encodes or verifies image data. */
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
