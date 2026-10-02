# sensor/spectral-coverage.ts public contracts

Package **1.0.0**, root API **0.116.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## createSensorSpectralCoverageParticipant

Adapts one parsed sensor response channel into the shared continuous
spectral-coverage contract.

This exposes support and interpolation knots only. It does not apply QE or
A/W responsivity and does not establish scene/optics coverage.

```ts
export function createSensorSpectralCoverageParticipant(
  input:
    CreateSensorSpectralCoverageParticipantInput
): SpectralCoverageParticipant;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CreateSensorSpectralCoverageParticipantInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CreateSensorSpectralCoverageParticipantInput {
  spectralResponseProfile:
    SensorSpectralResponseProfile;
  channelId: string;
  participantId?: string;
}
```
