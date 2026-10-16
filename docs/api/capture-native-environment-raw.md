# capture/native-environment-raw.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](https://github.com/Photivra/photivra/blob/main/docs/DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## createNativeEnvironmentRawTask

Every tile is planned and admission-checked before its radiance callbacks; no partial output escapes.

```ts
export function createNativeEnvironmentRawTask(input:NativeEnvironmentRawInput,provider:NativeEnvironmentRawProvider):NativeEnvironmentRawTask;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## createNativeEnvironmentSensorStageTask

Re-runs only the sensor stage from a retained optical stage: no radiance callback is invoked. Use it when only
post-optics settings change (noise seed, ISO and its bound readout regime/gain, fixed-pattern noise, charge/dark/capacity profiles,
white-balance intent, capture identity or tile width); white balance and rendering are then applied by
createNativeRawDevelopmentTask as usual. RAW codes are bit-identical to a full createNativeEnvironmentRawTask
with the same final inputs, provided the radiance provider is a deterministic function of its request. Any
optical difference (scene binding, geometry or orientation, focal length, aperture, shutter or exposure window,
focus, frame/CFA/binding profiles, or any site environment field such as PSF, field throughput, pupil, motion,
spectral or temporal sampling and provider profiles) refuses with InvalidConfigurationError before output.
providerEvaluationCount is 0; the stage remains owned by the caller and is not consumed.

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
  /** Full-event admission budget; maximum 2 billion calls. No convergence is inferred. */
  maximumProviderEvaluations: number;
  /**
   * Opt-in: retain the optical stage (per-site photo-signal expectations bound to every optical input) on the
   * output for createNativeEnvironmentSensorStageTask. Omission keeps the original behavior and output shape.
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
  /** Optional bounded diagnostic observer; counts are expectation values before any noise/clamp/ADC. */
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
