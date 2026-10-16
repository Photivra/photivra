# motion/video-sequence.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](https://github.com/Photivra/photivra/blob/main/docs/DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## assessShutterAngleRule

Assesses a shutter angle against the 180° cinematographic convention (exposure = half the frame
period). Within 1e-9 relative the angle "matches"; otherwise the signed deviation is reported.

```ts
export function assessShutterAngleRule(frameRateHz: number, shutterAngleDegrees: number): ShutterAngleRuleAssessment;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## calculateShutterAngleExposureSeconds

Exposure time of a rotary-shutter-equivalent shutter angle: t = (angle / 360) / frameRateHz.
A 180° angle exposes for half of each frame period.

```ts
export function calculateShutterAngleExposureSeconds(frameRateHz: number, shutterAngleDegrees: number): number;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## calculateShutterAngleFromExposureSeconds

Inverse of {@link calculateShutterAngleExposureSeconds}: angle = 360 · frameRateHz · t.

```ts
export function calculateShutterAngleFromExposureSeconds(frameRateHz: number, exposureSeconds: number): number;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## resolveVideoFrameSequence

Resolves `frameCount` consecutive video frames starting at `firstFrameIndex`.

Frame k (absolute index) opens at k / frameRateHz seconds from sequence start and exposes for
(angle / 360) / frameRateHz; its stochastic seed is a MurmurHash3 of (sequence seed, k, stream id).
Every value depends only on the inputs and k, so resolving frames 0–99 at once or as 0–49 and 50–99
yields identical frames (frame-to-frame determinism). With a rolling shutter each frame's line at
normalized scan position s integrates over [k/f + s·τ, k/f + s·τ + T]; τ must not exceed the frame
period so each line is read once per frame.

```ts
export function resolveVideoFrameSequence(input: ResolveVideoFrameSequenceInput): VideoFrameSequence;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolveVideoFrameSequenceInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolveVideoFrameSequenceInput {
  sequenceId: string;
  /** Exact optical capture state; captureMode must be "video" with a positive frameRateHz. */
  opticalState: OpticalProfileState;
  /** Shutter angle in (0, 360]; exposure = angle / 360 / frameRateHz. */
  shutterAngleDegrees: number;
  /** Absolute index of the first frame to resolve (default 0). */
  firstFrameIndex?: number;
  frameCount: number;
  sequenceSeedUint32: number;
  iso: number;
  /** Defaults to the optical state's finite focus distance. */
  focus?: FocusPlane;
  automation: { ae: ReleaseAutomationState; af: ReleaseAutomationState; awb: ReleaseAutomationState };
  whiteBalanceStateId?: string;
  /** Evidence for the commanded frame rate / shutter-angle timing (used for the exposure fact). */
  timingEvidence: readonly EvidenceProvenance[];
  /** Optional electronic rolling shutter applied identically to every frame. */
  rollingShutter?: {
    readout: RollingSensorReadoutTimingDeclaration;
    linkageEvidence: readonly EvidenceProvenance[];
  };
}
```

## ShutterAngleRuleAssessment

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ShutterAngleRuleAssessment {
  frameRateHz: number;
  shutterAngleDegrees: number;
  exposureSeconds: number;
  /** 1 / (2 · frameRateHz): the 180° convention. */
  conventionExposureSeconds: number;
  /** log2(exposure / convention): negative is shorter (crisper, more staccato) motion. */
  deviationStops: number;
  classification: "matches-180-degree-convention" | "shorter-than-convention" | "longer-than-convention";
  /** The 180° rule is a cinematographic convention for motion-blur appearance, not a physical law. */
  conventionNotPhysics: true;
}
```

## VIDEO_FRAME_SEED_STREAM_ID

Stream identifier ("VIDF") separating per-frame video seeds from per-site noise streams.

```ts
VIDEO_FRAME_SEED_STREAM_ID = 0x56494446 as const
```

## VIDEO_FRAME_SEQUENCE_MAXIMUM_FRAMES

Maximum frames resolved per call; longer clips are resolved in chunks with firstFrameIndex.

```ts
VIDEO_FRAME_SEQUENCE_MAXIMUM_FRAMES = 100_000 as const
```

## VIDEO_FRAME_SEQUENCE_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
VIDEO_FRAME_SEQUENCE_VERSION = "1.0.0" as const
```

## VideoFrameSequence

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface VideoFrameSequence {
  version: typeof VIDEO_FRAME_SEQUENCE_VERSION;
  sequenceId: string;
  frameRateHz: number;
  framePeriodSeconds: number;
  shutterAngleDegrees: number;
  exposureSeconds: number;
  shutterAngleRule: ShutterAngleRuleAssessment;
  firstFrameIndex: number;
  frameCount: number;
  sequenceSeedUint32: number;
  seedDerivation: "murmur3-x86-32(sequenceSeed, absoluteFrameIndex, VIDEO_FRAME_SEED_STREAM_ID)";
  frameTimeDerivation: "absoluteFrameIndex / frameRateHz";
  /**
   * Per-frame exposure schedule (identical for every frame; times are relative to each frame's own
   * first-opening phase). Null when no rolling shutter is declared: the caller supplies the global
   * schedule of its capture mode.
   */
  exposureSchedule: ReturnType<typeof createRollingShutterCaptureExposureSchedule> | null;
  rollingShutter: Pick<ElectronicRollingShutterExposureSchedule, "modelId" | "modelVersion" | "lineScanSkewSeconds" | "linkage"> | null;
  /** Ordinary release frames: pass each to createProductionCaptureSnapshotFromReleaseFrame. */
  frames: readonly ResolvedReleaseFrame[];
  limitations: readonly string[];
}
```
