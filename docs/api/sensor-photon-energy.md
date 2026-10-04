# sensor/photon-energy.ts public contracts

Package **1.3.0**, root API **1.3.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## AirRefractiveIndexConditionPolicy

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type AirRefractiveIndexConditionPolicy =
  | {
      kind: "exact-match-required";
    }
  | {
      kind: "assume-compatible";
      limitation: string;
      evidence: readonly EvidenceProvenance[];
    };
```

## AirRefractiveIndexReferenceConditions

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface AirRefractiveIndexReferenceConditions {
  temperatureC: number;
  pressurePascal: number;
  relativeHumidityFraction?: number;
  carbonDioxideMoleFraction?: number;
}
```

## calculatePhotonEnergyFromWavelength

Convert a valid vacuum wavelength, or explicitly atmosphere-bound air wavelength, into optical
frequency and photon energy using exact SI constants.

Photon energy uses exact SI h and c with vacuum wavelength. Air wavelength requires an
exact-wavelength sourced phase index and atmosphere compatibility; lambdaVacuum = n*lambdaAir.
Retained refractive-index uncertainty is not an automatically propagated photon-energy uncertainty.

```ts
export function calculatePhotonEnergyFromWavelength(
  input:
    CalculatePhotonEnergyFromWavelengthInput
): CalculationResult<PhotonEnergyFromWavelength>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculatePhotonEnergyFromWavelengthInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculatePhotonEnergyFromWavelengthInput {
  wavelengthNanometers: number;
  wavelengthBasis:
    SpectralWavelengthBasis;
  airPhaseRefractiveIndex?:
    SourcedAirPhaseRefractiveIndex;
  airOperatingConditions?:
    AirRefractiveIndexReferenceConditions;
  airConditionPolicy?:
    AirRefractiveIndexConditionPolicy;
}
```

## parseSourcedAirPhaseRefractiveIndex

Validate an untrusted declaration and return the normalized typed contract. Unknown enum values,
missing required fields and incompatible scientific data fail at this boundary.

Photon energy uses exact SI h and c with vacuum wavelength. Air wavelength requires an
exact-wavelength sourced phase index and atmosphere compatibility; lambdaVacuum = n*lambdaAir.
Retained refractive-index uncertainty is not an automatically propagated photon-energy uncertainty.

```ts
export function parseSourcedAirPhaseRefractiveIndex(
  value: unknown
): SourcedAirPhaseRefractiveIndex;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## PhotonEnergyFromWavelength

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface PhotonEnergyFromWavelength {
  inputWavelengthNanometers: number;
  inputWavelengthBasis:
    Exclude<SpectralWavelengthBasis, "unspecified">;
  vacuumWavelengthNanometers: number;
  frequencyHertz: number;
  photonEnergyJoules: number;
  wavelengthConversion:
    | "vacuum-identity"
    | "air-to-vacuum-via-phase-refractive-index";
  exactSiConstants: {
    planckConstantJouleSeconds:
      6.62607015e-34;
    speedOfLightMetersPerSecond:
      299792458;
  };
  phaseRefractiveIndexUsed?: number;
  airRefractiveIndexScientificStatus?:
    SensorSpectralResponseScientificStatus;
  airRefractiveIndexUncertainty?:
    SensorSpectralResponseUncertainty;
  airRefractiveIndexReferenceConditions?:
    AirRefractiveIndexReferenceConditions;
  airRefractiveIndexEvidence?:
    readonly EvidenceProvenance[];
  airOperatingConditions?:
    AirRefractiveIndexReferenceConditions;
  airConditionPolicy?:
    AirRefractiveIndexConditionPolicy;
  airConditionCompatibility?:
    | "exact-match"
    | "assumed-compatible";
  airConditionAssumptionEvidence?:
    readonly EvidenceProvenance[];
  inputUncertaintyPropagated: false;
}
```

## SourcedAirPhaseRefractiveIndex

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SourcedAirPhaseRefractiveIndex {
  wavelengthNanometers: number;
  wavelengthBasis: "air";
  definition:
    "vacuum-wavelength-divided-by-air-wavelength";
  phaseRefractiveIndex: number;
  scientificStatus:
    SensorSpectralResponseScientificStatus;
  uncertainty:
    SensorSpectralResponseUncertainty;
  evidence: readonly EvidenceProvenance[];
  referenceConditions?:
    AirRefractiveIndexReferenceConditions;
}
```
