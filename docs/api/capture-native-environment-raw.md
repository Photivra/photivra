# capture/native-environment-raw.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](https://github.com/Photivra/photivra/blob/main/docs/DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## createNativeEnvironmentRawTask

Creates the native RAW task. Every tile is planned and checked against the limits before its radiance
callbacks run, and no partial output is ever returned.

The task also yields to the host between sites inside a tile once about 8 ms of work has passed (one budget
shared with the tile loop). Cancellation is checked after each such yield, so cancel() takes effect within
about one site's work. Yield timing never changes tile requests, limit checks, callbacks or output.

```ts
export function createNativeEnvironmentRawTask(input:NativeEnvironmentRawInput,provider:NativeEnvironmentRawProvider):NativeEnvironmentRawTask;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## createNativeEnvironmentSensorStageTask

Re-runs only the sensor stage from a retained optical stage. No radiance callback is called.

Use it when only post-optics settings change: noise seed, ISO and its readout regime and gain,
fixed-pattern noise, charge, dark-current and capacity profiles, white-balance intent, capture identity
or tile width. White balance and rendering are then applied by createNativeRawDevelopmentTask as usual.

RAW codes are bit-identical to a full createNativeEnvironmentRawTask with the same final inputs, as long
as the radiance provider is a deterministic function of its request.

Any optical difference is rejected with InvalidConfigurationError before output. That includes scene
binding, geometry or orientation, focal length, aperture, shutter or exposure window, focus,
frame/CFA/binding profiles, and any site environment field such as PSF, field throughput, pupil, motion,
spectral or temporal sampling and provider profiles.

providerEvaluationCount is 0. The caller still owns the stage; it is not used up.

```ts
export function createNativeEnvironmentSensorStageTask(input:NativeEnvironmentSensorStageInput,opticalStage:NativeEnvironmentOpticalStage,
  provider:NativeEnvironmentSensorStageProvider):NativeEnvironmentRawTask;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## NativeEnvironmentPhotoTile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface NativeEnvironmentPhotoTile extends NativeRawTileRequest {
  sites:readonly {nativeIndex:number;expectedIncidentPhotonCount:number;expectedGeneratedElectronCount:number}[];
}
```

## NativeEnvironmentRawInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface NativeEnvironmentRawInput {
  raw: NativeRawInput;
  sceneBinding: SimulateEnvironmentSensorRawFrameInput["sceneBinding"];
  /** Budget of provider calls for the whole capture, checked before work starts; at most 2 billion. Staying within it does not imply convergence. */
  maximumProviderEvaluations: number;
  /**
   * Optional: keep the optical stage (per-site expected photo signal, tied to every optical input) on the
   * output, for createNativeEnvironmentSensorStageTask. If omitted, behaviour and output shape are unchanged.
   */
  opticalStage?: NativeEnvironmentOpticalStageRetention;
}
```

## NativeEnvironmentRawOutput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface NativeEnvironmentRawOutput {
  raw: NativeRawOutput;
  sceneBinding: NativeEnvironmentRawInput["sceneBinding"];
  providerEvaluationCount: number;
  upstreamOrigin: "executed-environment-query-provider-optics-psf-eqe";
  providerTransportVerified: false;
  productionPlanActivated: false;
  /** Present only when NativeEnvironmentRawInput.opticalStage was requested. The caller owns and disposes it. */
  opticalStage?: NativeEnvironmentOpticalStage;
}
```

## NativeEnvironmentRawProvider

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface NativeEnvironmentRawProvider {
  /** Supplies physical site profiles, not photo counts or precomputed RAW codes. */
  readTile(request: Readonly<NativeRawTileRequest>,signal:AbortSignal):Promise<NativeEnvironmentRawTile>;
  evaluateRadiance: SimulateEnvironmentSensorRawFrameInput["evaluateRadiance"];
  evaluateApertureRadiance?: SimulateEnvironmentSensorRawFrameInput["evaluateApertureRadiance"];
  /** Optional, bounded diagnostic callback. Counts are expected values before any noise, clipping or ADC (analogue-to-digital conversion). */
  observePhotoTile?(tile:Readonly<NativeEnvironmentPhotoTile>,signal:AbortSignal):void|Promise<void>;
  yieldControl(signal:AbortSignal):Promise<void>;
}
```

## NativeEnvironmentRawTask

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface NativeEnvironmentRawTask extends Omit<NativeRawTask,"takeOutput"> {
  readonly providerEvaluationCount: number;
  takeOutput(): NativeEnvironmentRawOutput;
}
```

## NativeEnvironmentRawTile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface NativeEnvironmentRawTile extends NativeRawTileRequest {
  sites: SimulateEnvironmentSensorRawFrameInput["sites"];
}
```
