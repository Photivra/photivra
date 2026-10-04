# schema/illumination-spectral.ts public contracts

Package **1.4.0**, root API **1.4.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## createSceneIlluminationSpectralCoverageParticipant

Adapts a continuous scene-illumination spectrum into the shared spectral
coverage contract.

Discrete-line spectra intentionally use their own measure path and are never
broadened into continuous breakpoints.

```ts
export function createSceneIlluminationSpectralCoverageParticipant(
  input:
    CreateSceneIlluminationSpectralCoverageParticipantInput
): SpectralCoverageParticipant;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CreateSceneIlluminationSpectralCoverageParticipantInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CreateSceneIlluminationSpectralCoverageParticipantInput {
  source: SceneIlluminationSource;
  participantId?: string;
}
```

## resolveSceneIlluminationDiscreteLineMeasure

Resolves a discrete illumination spectrum into integrated per-line source
quantities.

Relative line weights are fractions of the declared wavelength-integrated
source magnitude. A disabled source resolves to zero contribution. This
helper does not evaluate visibility, material response, transport, outgoing
scene radiance, optics, or sensor response.

```ts
export function resolveSceneIlluminationDiscreteLineMeasure(
  source:
    SceneIlluminationSource
): SceneIlluminationDiscreteLineMeasure;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## SceneIlluminationDiscreteLineMeasure

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SceneIlluminationDiscreteLineMeasure {
  sourceId: string;
  sourceFamily:
    SceneIlluminationSource["family"];
  sourceEnabled: boolean;
  spectrumId: string;
  magnitudeKind:
    SceneIlluminationSource["magnitude"]["kind"];
  magnitudeScientificStatus:
    SceneIlluminationScientificStatus;
  spectrumScientificStatus:
    "calibrated-relative-lines" |
    "approximation";
  measure: DiscreteSpectralLineMeasure;
  combinedUncertaintyCalculated: false;
  calibratedAbsoluteLineClaimAuthorized:
    false;
  materialTransportApplied: false;
  sceneRadianceCalculated: false;
}
```
