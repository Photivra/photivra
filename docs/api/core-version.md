# core/version.ts public contracts

Package **1.5.0**, root API **1.5.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## ENGINE_API_VERSION

Version of the public root-engine release, aligned with the npm package since 1.0.1.
New captures and plans record this creator identity; archived records retain theirs.
POC, schema and model contracts keep their independent versions.
Release checks enforce equality with package.json and the packed distribution.

```ts
ENGINE_API_VERSION = "1.5.0" as const
```
