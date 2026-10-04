# core/validation.ts public contracts

Package **1.3.0**, root API **1.3.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## InvalidScientificInputError

Error thrown when a public scientific calculation receives invalid input.

```ts
export class InvalidScientificInputError extends RangeError {
  readonly code = "INVALID_SCIENTIFIC_INPUT";

  constructor(message: string) {
    super(message);
    this.name = "InvalidScientificInputError";
  }
}
```

## InvalidScientificResultError

Error thrown when a scientific calculation would return a non-finite
numeric value that is unsafe for JSON and downstream consumers.

```ts
export class InvalidScientificResultError extends RangeError {
  readonly code = "INVALID_SCIENTIFIC_RESULT";

  constructor(message: string) {
    super(message);
    this.name = "InvalidScientificResultError";
  }
}
```
