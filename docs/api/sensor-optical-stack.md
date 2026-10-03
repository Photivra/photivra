# sensor/optical-stack.ts public contracts

Package **1.1.0**, root API **1.1.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## AntiAliasingPointSplitComponent

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface AntiAliasingPointSplitComponent {
  /**
   * Native sensor physical offset from the nominal landing point.
   * +X right, +Y down. Units: micrometres.
   */
  offsetMicrometers: {
    x: number;
    y: number;
  };
  /**
   * Dimensionless normalized spatial weight. Point-splitting kernels describe
   * spatial redistribution only; total stack throughput is outside this field.
   */
  normalizedWeight: number;
}
```

## parseSensorOpticalStackProfile

Parses descriptive sensor optical-stack metadata plus an optional explicitly
declared effective anti-aliasing spatial response.

Unknown facts are omitted instead of inferred. Physical component presence
is intentionally separate from effective anti-aliasing response so the
schema can represent cancellation/neutralization designs without claiming
the physical assembly is absent.

Cover/filter-stack and microlens presence do not create optical effects in
schema 0.1.0. Thickness, refractive index, spectral transmission, angular
acceptance, focus shift and microlens collection behavior require later
explicit models/calibration.

```ts
export function parseSensorOpticalStackProfile(
  value: unknown
): SensorOpticalStackProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## resolveAntiAliasingSpatialKernel

Resolves only the effective anti-aliasing spatial kernel.

This is not a whole optical-stack PSF. Cover/filter transmission, refraction,
microlens behavior, field/wavelength/polarization dependence, and total
throughput remain excluded.

A documented absent effective anti-aliasing response resolves to an identity
component at zero offset. An unknown response (field omitted) or a
present-but-unresolved response fails closed.

```ts
export function resolveAntiAliasingSpatialKernel(
  profileInput: SensorOpticalStackProfile
): ResolvedAntiAliasingSpatialKernel;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolvedAntiAliasingSpatialKernel

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolvedAntiAliasingSpatialKernel {
  profileId: string;
  effectiveResponse:
    | "absent"
    | "normalized-point-splitting-kernel";
  coordinateSystem: "native-sensor-physical";
  components: readonly AntiAliasingPointSplitComponent[];
  normalizedWeightSum: number;
  throughputIncluded: false;
  spectralTransmissionIncluded: false;
  fieldDependenceIncluded: false;
  wavelengthDependenceIncluded: false;
  polarizationDependenceIncluded: false;
  microlensResponseIncluded: false;
  coverFilterStackEffectsIncluded: false;
  wholeSensorOpticalStackResponse: false;
  provenance: {
    profile: readonly EvidenceProvenance[];
    antiAliasingResponse: readonly EvidenceProvenance[];
  };
}
```

## SensorEffectiveAntiAliasingSpatialResponse

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorEffectiveAntiAliasingSpatialResponse =
  | {
      /**
       * Documented absence/cancellation of intentional anti-aliasing spatial
       * splitting. This does not mean the whole sensor stack is optically
       * identity.
       */
      kind: "absent";
      evidence: readonly EvidenceProvenance[];
    }
  | {
      /**
       * An effective anti-aliasing response is known to exist, but its spatial
       * response is not defensibly specified.
       */
      kind: "present-unresolved";
      evidence: readonly EvidenceProvenance[];
    }
  | {
      /**
       * Generic normalized point-splitting approximation in native sensor
       * physical coordinates.
       */
      kind: "normalized-point-splitting-kernel";
      evidence: readonly EvidenceProvenance[];
      coordinateSystem: "native-sensor-physical";
      scope:
        "field-wavelength-polarization-invariant-approximation";
      components: readonly AntiAliasingPointSplitComponent[];
    };
```

## SensorMicrolensDeclaration

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorMicrolensDeclaration {
  presence: "present" | "absent";
  evidence: readonly EvidenceProvenance[];
  /**
   * Presence alone does not establish an angular, spectral, fill-factor, or
   * collection-efficiency model.
   */
  opticalEffectModel: "unresolved";
}
```

## SensorOpticalStackComponent

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorOpticalStackComponent {
  componentId: string;
  /**
   * Roles may be combined because one physical element can provide multiple
   * optical/filter functions.
   */
  roles: readonly SensorOpticalStackComponentRole[];
  evidence: readonly EvidenceProvenance[];
}
```

## SensorOpticalStackComponentRole

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorOpticalStackComponentRole =
  | "cover-glass"
  | "infrared-cut"
  | "ultraviolet-cut"
  | "anti-reflection"
  | "birefringent-low-pass"
  | "wave-plate"
  | "other-optical-filter";
```

## SensorOpticalStackProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorOpticalStackProfile {
  schemaVersion: "0.1.0";
  profileId: string;
  evidence: readonly EvidenceProvenance[];
  /**
   * Ordered from incident-light side toward the sensor.
   *
   * These components are descriptive metadata only. Their presence does not
   * create transmission, focus-shift, aberration, or spectral effects.
   */
  orderedComponents?: readonly SensorOpticalStackComponent[];
  /**
   * Omitted means unknown/unasserted.
   *
   * This is intentionally separate from physical component presence so a
   * stack can contain low-pass-related hardware while its net effective
   * anti-aliasing response is absent/cancelled.
   */
  effectiveAntiAliasingSpatialResponse?: SensorEffectiveAntiAliasingSpatialResponse;
  /**
   * Omitted means unknown/unasserted.
   */
  microlens?: SensorMicrolensDeclaration;
}
```
