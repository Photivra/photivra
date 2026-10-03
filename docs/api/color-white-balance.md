# color/white-balance.ts public contracts

Package **1.2.0**, root API **1.2.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## COLOR_TEMPERATURE_WHITE_BALANCE_INTENT_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
COLOR_TEMPERATURE_WHITE_BALANCE_INTENT_VERSION =
  "0.1.0" as const
```

## ColorTemperatureWhiteBalanceIntent

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ColorTemperatureWhiteBalanceIntent {
  version: typeof COLOR_TEMPERATURE_WHITE_BALANCE_INTENT_VERSION;
  intentId: string;
  colorTemperatureKelvin: number;
  tint: number;
  channelGainsResolved: false;
  requiresCameraProfileColorimetry: true;
  sceneIlluminationModified: false;
}
```

## createColorTemperatureWhiteBalanceIntent

Records independent color-temperature and tint intent.

No channel gains are fabricated here; mapping CCT+tint into a camera's
channel/color space belongs to a profile/colorimetry contract.

```ts
export function createColorTemperatureWhiteBalanceIntent(
  input: CreateColorTemperatureWhiteBalanceIntentInput
): ColorTemperatureWhiteBalanceIntent;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CreateColorTemperatureWhiteBalanceIntentInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CreateColorTemperatureWhiteBalanceIntentInput {
  intentId: string;
  colorTemperatureKelvin: number;
  tint: number;
}
```

## createLockedWhiteBalanceState

Freezes a resolved WB state under a new stable identity.

Locking changes neither the scene nor the gains; later AWB estimates may
differ while this locked state remains unchanged.

```ts
export function createLockedWhiteBalanceState(
  input: CreateLockedWhiteBalanceStateInput
): ResolvedWhiteBalanceState;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CreateLockedWhiteBalanceStateInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CreateLockedWhiteBalanceStateInput {
  stateId: string;
  sourceState: ResolvedWhiteBalanceState;
}
```

## estimateAutoWhiteBalance

Estimates one global AWB state from declared pre-WB camera-linear samples.

It intentionally does not accept true illuminant metadata. A gray-world
neutralizing estimate is softened by the profile's correctionStrength so
different generic AWB priorities can preserve different amounts of cast.

```ts
export function estimateAutoWhiteBalance(
  input: EstimateAutoWhiteBalanceInput
): ResolvedWhiteBalanceState;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## EstimateAutoWhiteBalanceInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface EstimateAutoWhiteBalanceInput {
  stateId: string;
  profile: WhiteBalanceProfile;
  policyId: string;
  sampleSet: PreWhiteBalanceRgbSampleSet;
}
```

## parseResolvedWhiteBalanceState

Parses a committed resolved white-balance state from an untrusted JSON
boundary without re-estimating WB.

This is intentionally a state parser, not an AWB estimator. It preserves the
resolved gains/policy/measurement identity that a capture committed earlier.

```ts
export function parseResolvedWhiteBalanceState(
  value: unknown
): ResolvedWhiteBalanceState;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## parseWhiteBalanceProfile

Parses generic WB presets and AWB policies.

Preset gains and AWB correction strength are profile-owned. Labels are not
treated as universal Kelvin aliases or manufacturer-specific behavior.

```ts
export function parseWhiteBalanceProfile(
  value: unknown
): WhiteBalanceProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## PreWhiteBalanceRgbSample

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface PreWhiteBalanceRgbSample {
  sampleId: string;
  red: number;
  green: number;
  blue: number;
  weight: number;
  clipped: boolean;
}
```

## PreWhiteBalanceRgbSampleSet

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface PreWhiteBalanceRgbSampleSet {
  imageStateId: string;
  inputDomain: WhiteBalanceInputDomain;
  samples: readonly PreWhiteBalanceRgbSample[];
}
```

## resolveCustomWhiteBalance

Resolves a user-declared neutral/gray custom-WB measurement.

The engine validates and reduces the selected pre-WB sample, but it does not
claim the selected object is spectrally neutral in the real scene.

```ts
export function resolveCustomWhiteBalance(
  input: ResolveCustomWhiteBalanceInput
): ResolvedWhiteBalanceState;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolveCustomWhiteBalanceInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolveCustomWhiteBalanceInput {
  stateId: string;
  sampleSet: PreWhiteBalanceRgbSampleSet;
}
```

## ResolvedWhiteBalanceState

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolvedWhiteBalanceState {
  version: typeof WHITE_BALANCE_STATE_VERSION;
  stateId: string;
  inputDomain: WhiteBalanceInputDomain;
  source:
    | "preset"
    | "manual-gains"
    | "custom-measurement"
    | "auto-white-balance";
  channelGains: WhiteBalanceChannelGains;
  locked: boolean;
  sourceProfile?: {
    profileId: string;
    profileVersion: string;
  };
  presetId?: string;
  awbPolicy?: {
    policyId: string;
    intent: WhiteBalanceAwbIntent;
    correctionStrength: number;
  };
  measurement?: {
    imageStateId: string;
    usableSampleCount: number;
    rejectedClippedSampleCount: number;
    weightedMeanPreWbSignal: {
      red: number;
      green: number;
      blue: number;
    };
  };
  sourceStateId?: string;
  trueIlluminantMetadataUsed: false;
  sceneIlluminationModified: false;
  rawCaptureDestructivelyModified: false;
  physicalExposureModified: false;
  focusModified: false;
  limitations: readonly string[];
}
```

## resolveManualWhiteBalance

Resolves explicit manual camera-linear channel gains.

```ts
export function resolveManualWhiteBalance(
  input: ResolveManualWhiteBalanceInput
): ResolvedWhiteBalanceState;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolveManualWhiteBalanceInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolveManualWhiteBalanceInput {
  stateId: string;
  channelGains: WhiteBalanceChannelGains;
}
```

## resolvePresetWhiteBalance

Resolves a profile-owned WB preset without universal label/Kelvin rules.

```ts
export function resolvePresetWhiteBalance(
  input: ResolvePresetWhiteBalanceInput
): ResolvedWhiteBalanceState;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolvePresetWhiteBalanceInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolvePresetWhiteBalanceInput {
  stateId: string;
  profile: WhiteBalanceProfile;
  presetId: string;
}
```

## WHITE_BALANCE_PROFILE_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
WHITE_BALANCE_PROFILE_SCHEMA_VERSION = "0.1.0" as const
```

## WHITE_BALANCE_STATE_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
WHITE_BALANCE_STATE_VERSION = "0.1.0" as const
```

## WhiteBalanceAwbIntent

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type WhiteBalanceAwbIntent =
  | "neutral-priority"
  | "standard"
  | "ambience-preserving";
```

## WhiteBalanceAwbPolicy

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface WhiteBalanceAwbPolicy {
  policyId: string;
  intent: WhiteBalanceAwbIntent;
  /**
   * Fraction of a gray-world neutralizing correction applied in logarithmic
   * gain space. 1 is full neutral-priority correction; lower values preserve
   * more of the observed cast.
   */
  correctionStrength: EvidenceBackedFact<number>;
  limitations?: readonly string[];
}
```

## WhiteBalanceChannelGains

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface WhiteBalanceChannelGains {
  red: number;
  green: number;
  blue: number;
}
```

## WhiteBalanceInputDomain

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type WhiteBalanceInputDomain =
  "relative-pre-wb-camera-linear-rgb";
```

## WhiteBalancePresetDefinition

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface WhiteBalancePresetDefinition {
  presetId: string;
  label: string;
  channelGains: EvidenceBackedFact<WhiteBalanceChannelGains>;
  nominalColorTemperatureKelvin?: number;
  nominalTint?: number;
  limitations?: readonly string[];
}
```

## WhiteBalanceProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface WhiteBalanceProfile {
  schemaVersion: typeof WHITE_BALANCE_PROFILE_SCHEMA_VERSION;
  profileId: string;
  profileVersion: string;
  scientificStatus: "approximation";
  inputDomain: WhiteBalanceInputDomain;
  presets: readonly WhiteBalancePresetDefinition[];
  awbPolicies: readonly WhiteBalanceAwbPolicy[];
  evidence: readonly EvidenceProvenance[];
  limitations: readonly string[];
}
```
