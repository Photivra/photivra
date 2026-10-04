# optics/sensor-psf-quadrature.ts public contracts

Package **1.4.0**, root API **1.4.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateSensorPsfIrradianceQuadrature

Apply each resolved unit-energy PSF as a destination-local inverse sample sum.
Native +Y-down support converts explicitly to optical +Y-up kernel orientation.
No boundary extension, missing-support renormalization or extra throughput is
applied. This approximation is not a field-dependent forward energy transport.

```ts
export function calculateSensorPsfIrradianceQuadrature(
  input: CalculateSensorPsfIrradianceQuadratureInput
): CalculationResult<SensorPsfIrradianceQuadrature>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateSensorPsfIrradianceQuadratureInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculateSensorPsfIrradianceQuadratureInput {
  /** One instant on the explicitly declared shutter opening reference. */
  timeSecondsFromOpeningReference: number;
  spatialQuadrature: ReduceSensorSpatioSpectralIrradianceInput["spatialQuadrature"];
  spectralQuadrature: ReduceSensorSpatioSpectralIrradianceInput["spectralQuadrature"];
  /** The adapter owns wavelength and image-plane field position for each node. */
  psf: Omit<ResolveLensSampledPsfInput, "fieldPointMm" | "wavelengthNm">;
  /** Schema 0.1.0 PSF profiles lack a basis field; bind that source meaning explicitly. */
  psfWavelengthBasis: { value: "air" | "vacuum"; evidence: readonly EvidenceProvenance[] };
  /** Explicit local approximation; a varying PSF grid is not a global convolution. */
  spatialModel: { kind: "destination-local-shift-invariant-approximation";
    evidence: readonly EvidenceProvenance[]; limitation: string };
  inputMeaning: "pre-psf-pre-sensor-stack-pre-aa-spectral-irradiance";
  /** All nodes and all kernel taps, including zero weights, must be supplied. */
  samples: readonly { node: SensorSpatioSpectralNodeIdentity; sourceSamples: readonly SensorPsfSourceSample[] }[];
}
```

## SensorPsfIrradianceQuadrature

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorPsfIrradianceQuadrature {
  timeSecondsFromOpeningReference: number;
  wavelengthBasis: "air" | "vacuum";
  sourcePlane: "sensor-package-incident";
  outputMeaning: "post-psf-pre-sensor-stack-pre-aa-irradiance-quadrature";
  psfRedistributionApplied: true;
  localShiftInvarianceEstablished: false;
  globalFieldEnergyConservationEstablished: false;
  pupilThroughputApplied: false;
  sceneProviderExecutionVerified: false;
  spatialModelEvidence: readonly EvidenceProvenance[];
  wavelengthBasisEvidence: readonly EvidenceProvenance[];
  spatialModelLimitation: string;
  irradianceSamples: ReduceSensorSpatioSpectralIrradianceInput["sampleValues"];
  reduction: ReturnType<typeof reduceSensorSpatioSpectralIrradiance>;
  samples: readonly { node: SensorSpatioSpectralNodeIdentity;
    psf: ReturnType<typeof resolveLensSampledPsf>; sourceSamples: readonly SensorPsfSourceSample[] }[];
}
```

## SensorPsfSourceSample

One pre-PSF incident irradiance value per explicitly identified kernel tap.

```ts
export interface SensorPsfSourceSample {
  timeSecondsFromOpeningReference: number;
  kernelSampleX: number;
  kernelSampleY: number;
  /** Optical-axis origin, +X right/+Y down, millimetres; no native crop clipping. */
  sourcePointNativeSensorMm: { x: number; y: number };
  spectralIrradianceWattsPerSquareMeterPerNanometer: number;
}
```
