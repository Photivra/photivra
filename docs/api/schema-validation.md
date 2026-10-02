# schema/validation.ts public contracts

Package **1.0.0**, root API **0.116.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## parseCameraConfiguration

Parses and validates an untrusted camera configuration.

```ts
export function parseCameraConfiguration(
  value: unknown
): CameraConfiguration;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## parseSceneDefinition

Parses and validates an untrusted renderer-independent scene definition.

```ts
export function parseSceneDefinition(value: unknown): SceneDefinition;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.
