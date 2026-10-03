# capture/capture-export-metadata.ts public contracts

Package **1.2.0**, root API **1.2.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## CAPTURE_EXPORT_METADATA_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
CAPTURE_EXPORT_METADATA_SCHEMA_VERSION = "0.1.0" as const
```

## CaptureExportArtifactIdentity

Caller-owned resource and saved-incarnation UUIDs; no random IDs or wall clock in the engine.

```ts
export interface CaptureExportArtifactIdentity { documentId: string; instanceId: string }
```

## CaptureExportMetadataInput

Metadata-only pairing input. CaptureID must already be a non-nil UUID on the committed capture.

```ts
export interface CaptureExportMetadataInput {
  capture: SimulatedCapture;
  workflow: CaptureExportWorkflow;
  /** Explicit capture-event UTC timestamp, exactly YYYY-MM-DDTHH:mm:ss.sssZ; never scene time. */
  capturedAtUtc: string;
  raw: CaptureExportArtifactIdentity;
  jpeg: CaptureExportArtifactIdentity;
}
```

## CaptureExportMetadataPair

Equal shared metadata and distinct resource IDs do not prove RAW/JPEG pixel derivation.

```ts
export interface CaptureExportMetadataPair {
  schemaVersion: typeof CAPTURE_EXPORT_METADATA_SCHEMA_VERSION;
  shared: CaptureExportSharedMetadata;
  raw: CaptureExportArtifactIdentity & { outputRole: "raw" };
  jpeg: CaptureExportArtifactIdentity & { outputRole: "jpeg" };
  imageDataPairing: "not-verified";
}
```

## CaptureExportSharedMetadata

Shared semantic values, not packed EXIF/DNG tags or an XMP packet.

```ts
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
```

## CaptureExportWorkflow

Non-generative workflows only; sampled/AI/composite media need a separate reviewed policy.

```ts
export type CaptureExportWorkflow = "human-directed-non-generative" | "fully-procedural-non-generative";
```

## createCaptureExportMetadataPair

Projects known capture metadata once for both future writers; never encodes or verifies image data.

```ts
export function createCaptureExportMetadataPair(input: CaptureExportMetadataInput): CaptureExportMetadataPair;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## parseCaptureExportMetadataInput

Fail-closed parser; no default workflow, time, creator, physical-device or file lineage claims.

```ts
export function parseCaptureExportMetadataInput(value: unknown): CaptureExportMetadataInput;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.
