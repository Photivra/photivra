# facade/display-view.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](https://github.com/Photivra/photivra/blob/main/docs/DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## bindDisplayViewCorrectionStates

2.10 (#447): adds states another realm computed (an export, or `computeCorrectionStates` results) to this realm's cache and
returns the number of states added. For each entry, the grid keys its setup does not hold yet are appended; known ones are
left as they are (a state's values follow from its key, so they are equal). Every entry is checked before the cache is
touched: `key` a non-empty string, `gridKeys` an Int32Array of grid keys, `values` a Float64Array of 3 × `gridKeys.length`
finite numbers; otherwise it fails with an InvalidConfigurationError and the cache is unchanged. The cache's bounds apply as
in a render: an unknown key creates a setup and can evict the least recently used of the four kept, and a setup that
reaches 65 536 states is cleared before the next one is added. Import only keys a prepared view reported
(`correctionKey()`), so states a render here will read.

```ts
export function bindDisplayViewCorrectionStates(entries: readonly DisplayViewCorrectionStateSet[]): number;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## DisplayViewCorrectionStateKeys

2.10 (#447): the grid keys of the states a region needs (`PreparedDisplayView.collectCorrectionStates`), ascending.

```ts
export interface DisplayViewCorrectionStateKeys { key: string; gridKeys: Int32Array }
```

## DisplayViewCorrectionStateSet

2.10 (#447): the AHD low-signal correction states of one setup, as a realm sends them to another. `key` is the setup's
correction key (`PreparedDisplayView.correctionKey()`), `gridKeys[i]` a state's grid key and `values[3·i …]` its three
values (28 bytes per state). Both arrays are transferable.

```ts
export interface DisplayViewCorrectionStateSet { key: string; gridKeys: Int32Array; values: Float64Array }
```

## serializeDisplayViewCorrectionStates

2.10 (#447): the AHD low-signal correction states this JavaScript realm holds (a Web Worker, a page), one entry per cached
setup, least recently used first, each state's grid key and three values copied out. Another realm adds them with
{@link bindDisplayViewCorrectionStates}; a render there then reads them instead of computing them, with the same bytes.

```ts
export function serializeDisplayViewCorrectionStates(): DisplayViewCorrectionStateSet[];
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.
