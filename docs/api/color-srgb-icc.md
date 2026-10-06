# color/srgb-icc.ts public contracts

Package **1.5.0**, root API **1.5.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## createSrgbIccProfile

Reference: https://registry.color.org/rgb-registry/files/sRGB.pdf and ICC.1:2022.
This is an original Photivra profile, not a redistributed ICC or operating-system profile.
Bradford here encodes the D50 profile-connection space; it does not apply shooting WB.

```ts
export function createSrgbIccProfile():Uint8Array;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## SRGB_ICC_PROFILE_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
SRGB_ICC_PROFILE_VERSION="0.1.0" as const
```
